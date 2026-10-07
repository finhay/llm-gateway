// One router profile (Phase 1). Disabled by default, shadow mode only: the request runs on
// `fallbackTarget` and the model Jev would have picked is recorded alongside it.

export const LEVELS = ["low", "medium", "high"];
export const MODES = ["shadow"];

export const DEFAULT_SMART_ROUTING = {
  enabled: false,
  name: "default",
  virtualModel: "auto/jev",
  mode: "shadow",
  provider: "typesafe", // decision provider id, see providers.js
  model: "", // empty = the provider's default model
  baseUrl: "", // empty = the provider's default endpoint
  // Candidates are discovered from the providers that are connected right now (see
  // candidateDiscovery.js). These narrow or correct that automatic pool:
  include: [], // glob patterns on "alias/model"; when not empty only matching models are offered
  exclude: [], // glob patterns to leave out, e.g. "gh/*", "*/gpt-3.5*"
  maxCandidates: 40,
  // { "cc/claude-opus-4-7": { qualityTier, latencyTier, costTier, capabilities: { vision, tools, structuredOutput },
  //   contextLimit, reasoningEfforts, description, exclude } }; replaces what was inferred for that model
  overrides: {},
  efforts: ["low", "medium", "high"], // closed set the decision model may choose from
  weights: { quality: 0.5, latency: 0.25, cost: 0.25 },
  minConfidence: 0.6,
  timeoutMs: 800,
  maxInputChars: 4000,
  fallbackTarget: "", // combo name or "provider/model" that actually serves the request
  apiKeyIds: [], // empty = every key may use the router
};

// Settings are merged shallowly, so a stored partial object must be completed here.
export function getSmartRoutingConfig(settings) {
  const stored = settings?.smartRouting || {};
  return { ...DEFAULT_SMART_ROUTING, ...stored, weights: { ...DEFAULT_SMART_ROUTING.weights, ...(stored.weights || {}) } };
}

/** @returns {string|null} a human readable problem, or null when the profile is valid */
export function validateSmartRoutingConfig(cfg) {
  if (!MODES.includes(cfg.mode)) return `mode must be one of: ${MODES.join(", ")}`;
  if (typeof cfg.virtualModel !== "string" || !cfg.virtualModel.trim()) return "virtualModel is required";
  if (!(cfg.minConfidence >= 0 && cfg.minConfidence <= 1)) return "minConfidence must be between 0 and 1";
  if (!(cfg.timeoutMs >= 100 && cfg.timeoutMs <= 30000)) return "timeoutMs must be between 100 and 30000";
  if (!Array.isArray(cfg.efforts) || cfg.efforts.length === 0 || cfg.efforts.some((e) => typeof e !== "string" || !e)) {
    return "efforts must be a non-empty list of names";
  }
  const w = cfg.weights || {};
  const weights = [w.quality, w.latency, w.cost];
  if (weights.some((x) => typeof x !== "number" || !(x >= 0)) || weights.every((x) => x === 0)) {
    return "weights.quality, weights.latency and weights.cost must be numbers >= 0, not all zero";
  }
  for (const key of ["include", "exclude"]) {
    if (!Array.isArray(cfg[key]) || cfg[key].some((p) => typeof p !== "string" || !p.trim())) {
      return `${key} must be a list of patterns such as "gh/*"`;
    }
  }
  if (!(cfg.maxCandidates >= 2 && cfg.maxCandidates <= 200)) return "maxCandidates must be between 2 and 200";
  if (!cfg.overrides || typeof cfg.overrides !== "object" || Array.isArray(cfg.overrides)) return "overrides must be an object";
  for (const [id, o] of Object.entries(cfg.overrides)) {
    if (!id.includes("/") || !o || typeof o !== "object") return `override key must be "alias/model" with an object value: ${id}`;
    for (const key of ["costTier", "latencyTier", "qualityTier"]) {
      if (o[key] !== undefined && !LEVELS.includes(o[key])) return `${id}: ${key} must be one of ${LEVELS.join(", ")}`;
    }
    if (o.contextLimit != null && !(o.contextLimit > 0)) return `${id}: contextLimit must be positive`;
    if (o.reasoningEfforts !== undefined && (!Array.isArray(o.reasoningEfforts) || o.reasoningEfforts.some((e) => !cfg.efforts.includes(e)))) {
      return `${id}: reasoningEfforts must be a subset of efforts (${cfg.efforts.join(", ")})`;
    }
  }
  if (cfg.enabled) {
    if (!cfg.fallbackTarget?.trim()) return "fallbackTarget is required to enable the router: it serves every request in shadow mode";
  }
  return null;
}
