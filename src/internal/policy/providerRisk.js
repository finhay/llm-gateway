const DEFAULT_RISK = {
  kiro: "high",
  "opencode-free": "high",
  "github-copilot": "high",
  "claude-code": "high",
  cursor: "high",
  antigravity: "high",
  codex: "high",
  openrouter: "medium",
  "openrouter-free": "medium",
  "anthropic-api": "low",
  openai: "low",
  "azure-openai": "low",
  vertex: "low",
  bedrock: "low",
};

const CLASSIFICATION_TO_MAX_RISK = {
  customer_pii: "low",
  source_code_private: "low",
  credentials: "low",
};

const RANK = {
  low: 1,
  medium: 2,
  high: 3,
};

export function getProviderRisk(providerId, overrides = {}) {
  return overrides?.[providerId] || DEFAULT_RISK[providerId] || "medium";
}

export function isProviderAllowed(providerId, classification, overrides = {}) {
  if (!classification) return true;
  const risk = getProviderRisk(providerId, overrides);
  const maxRisk = CLASSIFICATION_TO_MAX_RISK[classification] || "high";
  return (RANK[risk] || RANK.medium) <= (RANK[maxRisk] || RANK.high);
}

export { DEFAULT_RISK, CLASSIFICATION_TO_MAX_RISK };
