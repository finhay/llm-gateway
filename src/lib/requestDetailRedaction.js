const SENSITIVE_PAYLOAD_FIELDS = ["request", "providerRequest", "providerResponse", "response"];

export function redactRequestDetails(details) {
  return (details || []).map((detail) => {
    const redacted = { ...detail };
    for (const field of SENSITIVE_PAYLOAD_FIELDS) {
      if (redacted[field] !== undefined) redacted[field] = { redacted: true };
    }
    return redacted;
  });
}
