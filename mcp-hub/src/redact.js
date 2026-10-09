// Output redaction hook applied to every tool result before it reaches the LLM.
// MVP: mask obvious secrets. Phase 2: share detectors with src/internal/dlp of llm-gateway.
const PATTERNS = [
  [/\b(?:\d[ -]?){13,19}\b/g, "[REDACTED_CARD]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g, "Bearer [REDACTED]"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
];

export function redact(text) {
  let out = String(text);
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out;
}
