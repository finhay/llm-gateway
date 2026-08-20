import { describe, expect, it } from "vitest";
import { redactRequestDetails } from "../../src/lib/requestDetailRedaction.js";

describe("request details redaction", () => {
  it("removes conversation payloads while preserving usage metadata", () => {
    const [result] = redactRequestDetails([{
      id: "request-1",
      apiKeyId: "key-1",
      model: "model-1",
      tokens: { input: 10, output: 5 },
      request: { messages: [{ content: "secret prompt" }] },
      providerRequest: { messages: [{ content: "secret prompt" }] },
      providerResponse: { content: "secret response" },
      response: { content: "secret response" },
    }]);

    expect(result.id).toBe("request-1");
    expect(result.apiKeyId).toBe("key-1");
    expect(result.tokens).toEqual({ input: 10, output: 5 });
    expect(result.request).toEqual({ redacted: true });
    expect(result.providerRequest).toEqual({ redacted: true });
    expect(result.providerResponse).toEqual({ redacted: true });
    expect(result.response).toEqual({ redacted: true });
  });
});
