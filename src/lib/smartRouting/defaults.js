// Disabled by default. Targets in `routes` / `defaultTarget` are combo names or "provider/model".
export const DEFAULT_SMART_ROUTING = {
  enabled: false,
  virtualModel: "auto",
  provider: "typesafe", // decision provider id, see providers.js
  model: "", // empty = the provider's default model
  baseUrl: "", // empty = the provider's default endpoint
  minConfidence: 0.6,
  timeoutMs: 800,
  maxInputChars: 2000,
  longContextChars: 48000,
  defaultTarget: "",
  routes: {},
  apiKeyIds: [],
};

// Settings are merged shallowly, so a stored partial object must be completed here.
export function getSmartRoutingConfig(settings) {
  return { ...DEFAULT_SMART_ROUTING, ...(settings?.smartRouting || {}) };
}
