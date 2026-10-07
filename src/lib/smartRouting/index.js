import { createHash } from "node:crypto";
import { extractSignals, ruleTag, lookupRoute, buildClassifierText } from "./rules.js";
import { getDecisionProvider, resolveDecisionApiKey } from "./providers.js";
import { getSmartRoutingConfig } from "./defaults.js";

const CACHE_MAX = 1000;
const classifyCache = new Map(); // hash(text) -> classifier result
const conversationPins = new Map(); // hash(api key + first user turn) -> decision

const sha = (s) => createHash("sha1").update(s).digest("hex");

function remember(map, key, value) {
  if (map.size >= CACHE_MAX) map.delete(map.keys().next().value); // drop oldest
  map.set(key, value);
}

export function isSmartRoutingRequest(settings, modelStr) {
  const cfg = getSmartRoutingConfig(settings);
  return cfg.enabled && modelStr === cfg.virtualModel;
}

function appliesToKey(cfg, keyRecord) {
  const ids = cfg.apiKeyIds || [];
  return ids.length === 0 || (keyRecord?.id != null && ids.includes(keyRecord.id));
}

/**
 * Decide which combo / model a virtual-model request should use.
 * Never throws: any classifier problem degrades to cfg.defaultTarget (possibly "").
 * @returns {Promise<{ model: string, tag: string|null, complexity: string|null, confidence: number|null, source: string, ms: number }>}
 */
export async function resolveSmartRoute({ body, settings, keyRecord, env = process.env, fetchImpl }) {
  const started = Date.now();
  const cfg = getSmartRoutingConfig(settings);
  const done = (model, extra) => ({ model, tag: null, complexity: null, confidence: null, ...extra, ms: Date.now() - started });
  const fallback = (source) => done(cfg.defaultTarget || "", { source });

  if (!appliesToKey(cfg, keyRecord)) return fallback("key-not-allowed");

  const signals = extractSignals(body);
  const pinKey = sha(`${keyRecord?.id ?? ""}\n${signals.firstUser || signals.lastUser}`);
  const pinned = conversationPins.get(pinKey);
  if (pinned) return done(pinned.model, { ...pinned, source: "pinned" });

  // Pin only confident decisions; fallbacks (errors, low confidence) are retried next turn
  const pin = (decision) => {
    if (decision.model) remember(conversationPins, pinKey, decision);
    return decision;
  };

  const forced = ruleTag(signals, cfg);
  if (forced) {
    return pin(done(lookupRoute(cfg.routes, forced, null, cfg.defaultTarget), { tag: forced, source: "rule" }));
  }

  const text = buildClassifierText(signals, cfg.maxInputChars);
  if (!text.trim()) return fallback("empty-input");

  const provider = getDecisionProvider(cfg.provider);
  if (!provider) return fallback(`classifier-error: unknown decision provider "${cfg.provider}"`);
  const model = cfg.model || provider.defaultModel;

  const textKey = sha(`${provider.id}\n${model}\n${text}`);
  let result = classifyCache.get(textKey);
  let source = "cache";
  if (!result) {
    source = provider.id;
    try {
      result = await provider.classify({
        text,
        system: signals.system.slice(0, 500),
        apiKey: resolveDecisionApiKey({ settings, provider, env }).key,
        baseUrl: cfg.baseUrl || env[provider.envBaseUrlKey] || undefined,
        model,
        timeoutMs: cfg.timeoutMs,
        fetchImpl,
      });
      remember(classifyCache, textKey, result);
    } catch (error) {
      return fallback(`classifier-error: ${error.message}`);
    }
  }

  // Not pinned: the next turn adds context, so it gets another chance to be classified
  if (result.confidence < cfg.minConfidence) {
    return { ...fallback("low-confidence"), tag: result.tag, confidence: result.confidence };
  }
  // A shaky complexity read is dropped so routing falls back to the tag-only route
  const complexity = result.complexity && result.complexityConfidence >= cfg.minConfidence ? result.complexity : null;
  const target = lookupRoute(cfg.routes, result.tag, complexity, cfg.defaultTarget);
  return pin(done(target, { tag: result.tag, complexity, confidence: result.confidence, source }));
}

const headerSafe = (v) => String(v).replace(/[^ -~]/g, "").slice(0, 200);

/**
 * Copy of `response` with the routing decision in X-Smart-Routing-* headers, so a client can
 * see why it landed on this target. The body is passed through untouched (streams stay streams).
 * `answeredBy` is the model that produced the answer (for a combo, the fallback winner).
 */
export function withRouteHeaders(response, route, answeredBy = null) {
  if (!(response instanceof Response)) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Smart-Routing-Target", headerSafe(route.model));
  if (answeredBy) headers.set("X-Smart-Routing-Model", headerSafe(answeredBy));
  headers.set("X-Smart-Routing-Source", headerSafe(route.source.split(":")[0]));
  if (route.tag) headers.set("X-Smart-Routing-Tag", headerSafe(route.complexity ? `${route.tag}:${route.complexity}` : route.tag));
  if (route.confidence != null) headers.set("X-Smart-Routing-Confidence", String(route.confidence));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
