import { beforeEach, describe, expect, it, vi } from "vitest";

import { preProvider } from "../../src/internal/middleware/preProvider.js";

const insertedEvents = [];

vi.mock("../../src/lib/db/driver.js", () => ({
  getAdapter: vi.fn(async () => ({
    transaction: (fn) => fn(),
    run: vi.fn((sql, params) => insertedEvents.push(params)),
  })),
}));

describe("preProvider", () => {
  beforeEach(() => {
    insertedEvents.length = 0;
  });

  it("blocks critical secrets before provider routing", async () => {
    const body = {
      model: "anthropic-api/claude",
      messages: [{ role: "user", content: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----" }],
    };

    const result = await preProvider({
      body,
      modelStr: body.model,
      apiKey: "test-key",
      settings: { securityScan: { secretsMode: "enforce", dlpMode: "enforce" } },
      request: new Request("http://localhost/v1/chat/completions"),
    });

    expect(result.deny).toBeTruthy();
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0][12]).toBe("blocked");
  });

  it("redacts PII and returns a provider filter", async () => {
    const body = {
      model: "combo/test",
      messages: [{ role: "user", content: "customer SSN 123-45-6789" }],
    };

    const result = await preProvider({
      body,
      modelStr: body.model,
      apiKey: "test-key",
      settings: { securityScan: { secretsMode: "enforce", dlpMode: "enforce" } },
      request: new Request("http://localhost/v1/chat/completions"),
    });

    expect(result.providerFilter({ provider: "kiro" })).toBe(false);
    expect(result.providerFilter({ provider: "anthropic-api" })).toBe(true);
    expect(body.messages[0].content).toContain("[REDACTED_NATIONAL_ID]");
    expect(insertedEvents[0][12]).toBe("redacted");
  });

  it("does not reject a provider for identifiers found only in structural prompts", async () => {
    const body = {
      model: "claude-sonnet-m3",
      system: [
        { type: "text", text: "Internal client example identifier: 012345678901" },
      ],
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "example", description: "Generated tool metadata" }],
    };

    const result = await preProvider({
      body,
      modelStr: body.model,
      apiKey: null,
      settings: { securityScan: { secretsMode: "enforce", dlpMode: "enforce" } },
      request: new Request("http://localhost/v1/messages?beta=true"),
    });

    expect(result.deny).toBeFalsy();
    expect(result.classification).toBeNull();
    expect(result.providerFilter).toBeNull();
    expect(body.system[0].text).toContain("[REDACTED_NATIONAL_ID]");
  });

  it("uses detector action overrides", async () => {
    const body = {
      model: "combo/test",
      messages: [{ role: "user", content: "customer SSN 123-45-6789" }],
    };

    const result = await preProvider({
      body,
      modelStr: body.model,
      apiKey: "test-key",
      settings: {
        securityScan: {
          secretsMode: "enforce",
          dlpMode: "enforce",
          detectorOverrides: { national_id: { action: "logged" } },
        },
      },
      request: new Request("http://localhost/v1/chat/completions"),
    });

    expect(result.deny).toBeFalsy();
    expect(body.messages[0].content).toContain("123-45-6789");
    expect(insertedEvents[0][12]).toBe("logged");
  });

  it("blocks when detector action override is block", async () => {
    const body = {
      model: "combo/test",
      messages: [{ role: "user", content: "customer@example.com" }],
    };

    const result = await preProvider({
      body,
      modelStr: body.model,
      apiKey: "test-key",
      settings: {
        securityScan: {
          secretsMode: "enforce",
          dlpMode: "enforce",
          detectorOverrides: { email: { action: "blocked" } },
        },
      },
      request: new Request("http://localhost/v1/chat/completions"),
    });

    expect(result.deny).toBeTruthy();
    expect(insertedEvents[0][12]).toBe("blocked");
  });
});
