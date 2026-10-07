// Turns the models the gateway can currently reach into router candidates, inferring the
// metadata the decision model needs. Pure functions: discovery (I/O) lives in
// src/sse/services/candidateDiscovery.js. Everything here is a best-effort default that an
// admin can correct per model through `overrides`.

const LEVELS = ["low", "medium", "high"];

// Anchored on whole name parts so "mini" does not match "gemini"
const part = (words) => new RegExp(`(^|[^a-z0-9])(${words})([^a-z0-9]|$)`, "i");
const FAST_NAMES = part("haiku|mini|nano|flash|lite|small|tiny|instant|air|turbo|8b|7b");
const FRONTIER_NAMES = part("opus|fable|ultra|large|pro|max|r1|reasoner|thinking|o1|o3|o4|sol");
const GPT5 = /gpt-?5/i;
const VISION_NAMES = /claude|gpt-4o|gpt-4\.1|gpt-5|gemini|vision|(^|[^a-z0-9])vl([^a-z0-9]|$)|llava|pixtral|omni|kimi|grok-4/i;
const REASONING_NAMES = /gpt-?5|(^|[^a-z0-9])o[134]([^a-z0-9]|$)|opus|sonnet-?[45]|fable|thinking|(^|[^a-z0-9])r1([^a-z0-9]|$)|reason|gemini-?(2\.5|3)|glm-?[45]/i;

export function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export const matchesAny = (id, patterns = []) => patterns.some((p) => globToRegExp(p).test(id));

/** Name-based guess of quality, latency, capabilities and reasoning support for one model. */
export function inferModelProfile({ id, name = "" }) {
  const model = id.slice(id.indexOf("/") + 1);
  const label = `${model} ${name}`;
  const fast = FAST_NAMES.test(label) && !GPT5.test(label.replace(FAST_NAMES, ""));
  const frontier = FRONTIER_NAMES.test(label) || (GPT5.test(label) && !fast);
  const reasoning = REASONING_NAMES.test(label);
  return {
    qualityTier: fast ? "low" : frontier ? "high" : "medium",
    latencyTier: fast ? "low" : frontier || reasoning ? "high" : "medium",
    capabilities: { vision: VISION_NAMES.test(label), tools: true, structuredOutput: true },
    reasoningEfforts: reasoning ? [...LEVELS] : [],
  };
}

// Cost tier from the output price, relative to the other models in the pool
function costTiers(models) {
  const prices = models.map((m) => m.pricing?.output).filter((p) => typeof p === "number").sort((a, b) => a - b);
  if (prices.length === 0) return () => "medium";
  const at = (q) => prices[Math.min(prices.length - 1, Math.floor(q * prices.length))];
  const low = at(1 / 3);
  const high = at(2 / 3);
  return (price) => {
    if (typeof price !== "number") return "medium";
    if (price <= low) return "low";
    return price >= high && price > low ? "high" : "medium";
  };
}

function applyOverride(inferred, override = {}, efforts) {
  const merged = { ...inferred, ...override, capabilities: { ...inferred.capabilities, ...(override.capabilities || {}) } };
  merged.reasoningEfforts = (merged.reasoningEfforts || []).filter((e) => efforts.includes(e));
  return merged;
}

// Keep the pool within what a single decision can weigh, spread across quality x cost
// instead of cutting off alphabetically
export function limitPool(candidates, max) {
  if (candidates.length <= max) return candidates;
  const buckets = new Map();
  for (const c of [...candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${c.qualityTier}:${c.costTier}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  const lists = [...buckets.values()];
  const picked = [];
  for (let i = 0; picked.length < max; i++) {
    let added = false;
    for (const list of lists) {
      if (i < list.length && picked.length < max) {
        picked.push(list[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  return picked;
}

/**
 * @param {{ id: string, provider: string, name?: string, pricing?: { input?: number, output?: number } }[]} models
 *        every reachable LLM model, id as "alias/model-id"
 * @param {object} cfg smartRouting config (include, exclude, overrides, efforts, maxCandidates)
 * @returns candidates ready for the decision model, with provider kept for policy checks
 */
export function buildCandidatePool(models, cfg) {
  const include = cfg.include || [];
  const wanted = models.filter((m) => {
    if (include.length > 0 && !matchesAny(m.id, include)) return false;
    if (matchesAny(m.id, cfg.exclude || [])) return false;
    return cfg.overrides?.[m.id]?.exclude !== true;
  });
  const costTier = costTiers(wanted);
  const candidates = wanted.map((m) => {
    const inferred = { ...inferModelProfile(m), costTier: costTier(m.pricing?.output) };
    const profile = applyOverride(inferred, cfg.overrides?.[m.id], cfg.efforts);
    const { exclude: _drop, ...rest } = profile;
    return {
      ...rest,
      id: m.id,
      provider: m.provider,
      costPerMTokens: m.pricing ? { input: m.pricing.input, output: m.pricing.output } : undefined,
    };
  });
  return limitPool(candidates, cfg.maxCandidates);
}
