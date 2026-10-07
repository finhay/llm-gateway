import { createHash } from "node:crypto";
import { extractSignals, buildConversationExcerpt } from "./signals.js";
import { filterCandidates } from "./candidates.js";
import { getDecisionProvider, resolveDecisionApiKey } from "./providers.js";
import { getSmartRoutingConfig } from "./defaults.js";

export function isSmartRoutingRequest(settings, modelStr) {
  const cfg = getSmartRoutingConfig(settings);
  return cfg.enabled && modelStr === cfg.virtualModel;
}

/** Short fingerprint of everything that shapes a decision, so records can be grouped per profile version. */
export function profileVersion(cfg) {
  const { efforts, weights, minConfidence, provider, model, mode, fallbackTarget, include, exclude, overrides, maxCandidates } = cfg;
  return createHash("sha1")
    .update(JSON.stringify({ efforts, weights, minConfidence, provider, model, mode, fallbackTarget, include, exclude, overrides, maxCandidates }))
    .digest("hex")
    .slice(0, 8);
}

// Only a reasoning effort the profile and the chosen model both support is kept
function validEffort(effort, cfg, candidate) {
  const supported = candidate.reasoningEfforts || [];
  return effort && cfg.efforts.includes(effort) && supported.includes(effort) ? effort : null;
}

/**
 * Phase 1 (shadow): decide which candidate model and reasoning effort the router would pick.
 * The request itself is always served by `fallbackTarget`; the returned decision is metadata.
 * Never throws: every failure becomes `fallbackReason`.
 *
 * @param {object} args
 * @param {object[]} args.candidates models discovered as reachable right now (see candidateDiscovery.js)
 * @param {(candidate: object) => Promise<string|null>} args.checkPolicy why a candidate is not allowed/available, or null
 * @returns {Promise<object>} decision (no prompt text, safe to persist)
 */
export async function decideRoute({ body, settings, keyRecord, candidates, checkPolicy, env = process.env, fetchImpl }) {
  const started = Date.now();
  const cfg = getSmartRoutingConfig(settings);
  const decision = {
    profile: cfg.name,
    version: profileVersion(cfg),
    mode: cfg.mode,
    executed: cfg.fallbackTarget,
    source: "fallback",
    fallbackReason: null,
    selected: null,
    suggested: null,
    effort: null,
    confidence: null,
    probabilities: null,
    pool: candidates.length,
    eligible: [],
    rejected: [],
    usage: null,
    decisionMs: 0,
  };
  const fallback = (reason, extra = {}) => ({ ...decision, ...extra, fallbackReason: reason, decisionMs: Date.now() - started });

  const allowedKeys = cfg.apiKeyIds || [];
  if (allowedKeys.length > 0 && !(keyRecord?.id != null && allowedKeys.includes(keyRecord.id))) {
    return fallback("key-not-allowed");
  }

  const signals = extractSignals(body);
  const { eligible, rejected } = await filterCandidates(candidates, signals, checkPolicy);
  const eligibleIds = eligible.map((c) => c.id);
  if (eligible.length === 0) return fallback("no-eligible-candidates", { rejected });

  // Nothing to decide: skip the external call
  if (eligible.length === 1) {
    return { ...decision, source: "single-candidate", selected: eligible[0].id, eligible: eligibleIds, rejected, decisionMs: Date.now() - started };
  }

  const provider = getDecisionProvider(cfg.provider);
  if (!provider) return fallback("unknown-provider", { eligible: eligibleIds, rejected });

  let answer;
  try {
    answer = await provider.decide({
      excerpt: buildConversationExcerpt(signals, { maxChars: cfg.maxInputChars }),
      candidates: eligible,
      efforts: cfg.efforts,
      weights: cfg.weights,
      apiKey: resolveDecisionApiKey({ settings, provider, env }).key,
      baseUrl: cfg.baseUrl || env[provider.envBaseUrlKey] || undefined,
      model: cfg.model || provider.defaultModel,
      timeoutMs: cfg.timeoutMs,
      fetchImpl,
    });
  } catch (error) {
    return fallback(error.code || "provider-error", { eligible: eligibleIds, rejected });
  }

  const known = { eligible: eligibleIds, rejected, suggested: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities, usage: answer.usage };
  const chosen = eligible.find((c) => c.id === answer.choice);
  // The decision model can only pick from what it was offered; anything else is rejected in code
  if (!chosen) return fallback("invalid-choice", known);
  if (answer.confidence < cfg.minConfidence) return fallback("low-confidence", known);

  return {
    ...decision,
    ...known,
    source: provider.id,
    selected: chosen.id,
    effort: validEffort(answer.effort, cfg, chosen),
    decisionMs: Date.now() - started,
  };
}

const headerSafe = (v) => String(v).replace(/[^\x20-\x7E]/g, "").slice(0, 200);

/**
 * Copy of `response` with the decision in X-Smart-Routing-* headers. The body is passed
 * through untouched (streams stay streams). In shadow mode `Target` is what served the request
 * and `Shadow-*` is what the router would have chosen. `answeredBy` is the model that produced the answer.
 */
export function withRouteHeaders(response, decision, answeredBy = null) {
  if (!(response instanceof Response)) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Smart-Routing-Mode", decision.mode);
  headers.set("X-Smart-Routing-Target", headerSafe(decision.executed));
  if (answeredBy) headers.set("X-Smart-Routing-Model", headerSafe(answeredBy));
  headers.set("X-Smart-Routing-Source", headerSafe(decision.fallbackReason ? `fallback:${decision.fallbackReason}` : decision.source));
  if (decision.selected) headers.set("X-Smart-Routing-Shadow-Choice", headerSafe(decision.selected));
  if (decision.effort) headers.set("X-Smart-Routing-Shadow-Effort", headerSafe(decision.effort));
  if (decision.confidence != null) headers.set("X-Smart-Routing-Confidence", String(decision.confidence));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
