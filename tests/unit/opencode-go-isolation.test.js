import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(async () => ({ status: 200 })),
}));

import { OpenCodeGoExecutor } from "open-sse/executors/opencode-go.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";

describe("OpenCodeGoExecutor cross-request isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives authentication from each call's model without instance state", () => {
    const executor = new OpenCodeGoExecutor();

    const claudeHeaders = executor.buildHeaders(
      { apiKey: "claude-key" },
      true,
      null,
      "minimax-m2.5"
    );
    const openAiHeaders = executor.buildHeaders(
      { apiKey: "openai-key" },
      true,
      null,
      "glm-5"
    );

    expect(claudeHeaders["x-api-key"]).toBe("claude-key");
    expect(claudeHeaders.Authorization).toBeUndefined();
    expect(openAiHeaders.Authorization).toBe("Bearer openai-key");
    expect(openAiHeaders["x-api-key"]).toBeUndefined();
    expect(executor).not.toHaveProperty("_lastModel");
  });

  it("keeps auth and endpoint paired across concurrent execute calls", async () => {
    const executor = new OpenCodeGoExecutor();

    await Promise.all([
      executor.execute({
        model: "minimax-m2.5",
        body: { messages: [] },
        stream: true,
        credentials: { apiKey: "claude-key" },
      }),
      executor.execute({
        model: "glm-5",
        body: { messages: [] },
        stream: true,
        credentials: { apiKey: "openai-key" },
      }),
    ]);

    const requests = proxyAwareFetch.mock.calls.map(([url, options]) => ({
      url,
      headers: options.headers,
    }));
    const claudeRequest = requests.find(({ url }) => url.endsWith("/messages"));
    const openAiRequest = requests.find(({ url }) => url.endsWith("/chat/completions"));

    expect(claudeRequest.headers["x-api-key"]).toBe("claude-key");
    expect(claudeRequest.headers.Authorization).toBeUndefined();
    expect(openAiRequest.headers.Authorization).toBe("Bearer openai-key");
    expect(openAiRequest.headers["x-api-key"]).toBeUndefined();
  });
});
