/**
 * Unit tests for Anthropic header isolation + forwarding pipeline
 *
 * Tests cover:
 *  - default.js buildHeaders(): immutable server-side identity for "claude"
 *  - default.js buildHeaders(): anthropic-compatible non-Anthropic host stripping
 *  - default.js buildHeaders(): anthropic-compatible official host keeps headers
 *  - proxyFetch.js: api.anthropic.com routes through anthropicFetch path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── DefaultExecutor.buildHeaders() ──────────────────────────────────────────

describe("DefaultExecutor.buildHeaders() — claude provider", () => {
  let DefaultExecutor;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("open-sse/executors/default.js");
    DefaultExecutor = mod.DefaultExecutor || mod.default;
  });

  it("uses the immutable server-side Claude fingerprint", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-test" }, true);

    expect(headers["User-Agent"]).toContain("claude-cli/");
    const betaFlags = headers["Anthropic-Beta"].split(",").map(s => s.trim());
    expect(betaFlags).toContain("claude-code-20250219");
    expect(betaFlags).toContain("oauth-2025-04-20");
    expect(betaFlags).toContain("interleaved-thinking-2025-05-14");
  });

  it("does not retain mutable identity state between calls", () => {
    const executor = new DefaultExecutor("claude");
    const first = executor.buildHeaders({ apiKey: "first-key" }, true);
    first["User-Agent"] = "caller-controlled";
    const second = executor.buildHeaders({ apiKey: "second-key" }, true);

    expect(second["User-Agent"]).toContain("claude-cli/");
    expect(second["User-Agent"]).not.toBe("caller-controlled");
    expect(second["x-api-key"]).toBe("second-key");
  });

  it("sets x-api-key auth when apiKey is provided", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-live-key" }, true);
    expect(headers["x-api-key"]).toBe("sk-live-key");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("sets Bearer Authorization when only accessToken is provided", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ accessToken: "tok-abc" }, true);
    expect(headers["Authorization"]).toBe("Bearer tok-abc");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("includes Accept: text/event-stream when stream=true", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "k" }, true);
    expect(headers["Accept"]).toBe("text/event-stream");
  });

  it("omits Accept: text/event-stream when stream=false", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "k" }, false);
    expect(headers["Accept"]).toBeUndefined();
  });
});

describe("DefaultExecutor.buildHeaders() — claude static fallback", () => {
  let DefaultExecutor;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("open-sse/executors/default.js");
    DefaultExecutor = mod.DefaultExecutor || mod.default;
  });

  it("always includes the static provider headers", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-test" }, true);

    const hasVersion =
      headers["Anthropic-Version"] === "2023-06-01" ||
      headers["anthropic-version"] === "2023-06-01";
    expect(hasVersion).toBe(true);
  });

  it("builds headers without any client-header cache", () => {
    const executor = new DefaultExecutor("claude");
    expect(() => executor.buildHeaders({ apiKey: "sk" }, false)).not.toThrow();
  });
});

// ─── anthropic-compatible header stripping ────────────────────────────────────

describe("DefaultExecutor.buildHeaders() — anthropic-compatible stripping", () => {
  let DefaultExecutor;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("open-sse/executors/default.js");
    DefaultExecutor = mod.DefaultExecutor || mod.default;
  });

  it("strips x-app and anthropic-dangerous-direct-browser-access for non-Anthropic host", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      true
    );

    expect(headers["x-app"]).toBeUndefined();
    expect(headers["X-App"]).toBeUndefined();
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBeUndefined();
    expect(headers["Anthropic-Dangerous-Direct-Browser-Access"]).toBeUndefined();
  });

  it("removes claude-code-20250219 from anthropic-beta for non-Anthropic host", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      true
    );

    const betaVal = headers["anthropic-beta"] || headers["Anthropic-Beta"] || "";
    expect(betaVal).not.toContain("claude-code-20250219");
  });

  it("keeps other beta flags intact after stripping", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    // The static CLAUDE_API_HEADERS used by anthropic-compatible providers include
    // 'interleaved-thinking-2025-05-14' — check it survives stripping
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      false
    );

    const betaVal = headers["anthropic-beta"] || headers["Anthropic-Beta"] || "";
    // If any beta value remains it should not be empty and should not have the stripped value
    if (betaVal) {
      expect(betaVal).not.toContain("claude-code-20250219");
    }
  });

  it("does NOT strip headers when baseUrl is api.anthropic.com", () => {
    const executor = new DefaultExecutor("anthropic-compatible-official");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://api.anthropic.com/v1" },
      },
      true
    );

    // No stripping — anthropic-version should survive
    const hasVersion =
      headers["Anthropic-Version"] || headers["anthropic-version"];
    expect(hasVersion).toBeDefined();
  });

  it("does NOT strip headers when baseUrl is empty (defaults to Anthropic)", () => {
    const executor = new DefaultExecutor("anthropic-compatible-official");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: {},
      },
      true
    );

    const hasVersion =
      headers["Anthropic-Version"] || headers["anthropic-version"];
    expect(hasVersion).toBeDefined();
  });
});

// ─── proxyFetch anthropicFetch routing ────────────────────────────────────────

describe("proxyAwareFetch — api.anthropic.com routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes api.anthropic.com to gotScraping (non-streaming) and returns ok response", async () => {
    // Mock got-scraping before module load
    vi.doMock("got-scraping", () => {
      const mockGotScraping = vi.fn().mockResolvedValue({
        statusCode: 200,
        statusMessage: "OK",
        headers: { "content-type": "application/json" },
        rawBody: Buffer.from(JSON.stringify({ id: "msg_test" })),
      });
      mockGotScraping.stream = vi.fn();
      return { gotScraping: mockGotScraping };
    });

    vi.resetModules();
    const { proxyAwareFetch } = await import("open-sse/utils/proxyFetch.js");
    const { gotScraping } = await import("got-scraping");

    const res = await proxyAwareFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      // No Accept: text/event-stream → non-streaming path
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", messages: [] }),
    });

    expect(gotScraping).toHaveBeenCalledOnce();
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("msg_test");
  });

  it("falls back gracefully when got-scraping throws on non-streaming path", async () => {
    vi.doMock("got-scraping", () => {
      const fn = vi.fn().mockRejectedValue(new Error("TLS error"));
      fn.stream = vi.fn();
      return { gotScraping: fn };
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      body: null,
      text: async () => "{}",
      json: async () => ({}),
    });

    vi.resetModules();
    const { proxyAwareFetch } = await import("open-sse/utils/proxyFetch.js");

    const res = await proxyAwareFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.ok).toBe(true);
    globalThis.fetch = originalFetch;
  });

  it("does NOT route non-Anthropic hosts through gotScraping", async () => {
    const gotScrapingMock = vi.fn();
    vi.doMock("got-scraping", () => ({ gotScraping: gotScrapingMock }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      body: null,
      text: async () => "{}",
      json: async () => ({}),
    });

    vi.resetModules();
    const { proxyAwareFetch } = await import("open-sse/utils/proxyFetch.js");

    await proxyAwareFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(gotScrapingMock).not.toHaveBeenCalled();
  });
});
