/**
 * Unit tests for src/lib/smartRouting
 *
 *  - extractSignals() / ruleTag() / lookupRoute()  — rules.js
 *  - resolveSmartRoute()                           — index.js (classifier mocked via fetchImpl)
 */

import { describe, it, expect, vi } from "vitest";
import { extractSignals, ruleTag, lookupRoute, buildClassifierText } from "../../src/lib/smartRouting/rules.js";
import { getDecisionProvider, resolveDecisionApiKey, getDecisionKeyStatus } from "../../src/lib/smartRouting/providers.js";
import { resolveSmartRoute, isSmartRoutingRequest, withRouteHeaders } from "../../src/lib/smartRouting/index.js";

const settings = (over = {}) => ({
  smartRouting: {
    enabled: true,
    defaultTarget: "always-on",
    routes: { code: "code-cheap", "code:high": "code-premium", agent: "agent-combo", chat: "cheap-fast" },
    ...over,
  },
});

const chat = (text, extra = {}) => ({ model: "auto", messages: [{ role: "user", content: text }], ...extra });

const classifierReply = (tag, confidence, complexity = "low", complexityConfidence = 0.9) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({
      answers: {
        tag: { type: "choice", choice: tag, confidence },
        complexity: { type: "choice", choice: complexity, confidence: complexityConfidence },
      },
    }),
  }));

const env = { TYPESAFE_API_KEY: "test-key" };

describe("rules", () => {
  it("extracts text from OpenAI chat, Responses and Claude shapes", () => {
    expect(extractSignals(chat("hi")).lastUser).toBe("hi");
    expect(extractSignals({ input: "hello" }).lastUser).toBe("hello");
    const claude = extractSignals({ system: [{ type: "text", text: "be brief" }], messages: [{ role: "user", content: [{ type: "text", text: "yo" }] }] });
    expect(claude.system).toBe("be brief");
    expect(claude.lastUser).toBe("yo");
  });

  it("detects tools, images and long context", () => {
    expect(ruleTag(extractSignals(chat("x", { tools: [{}] })))).toBe("agent");
    const img = chat("x");
    img.messages[0].content = [{ type: "image_url", image_url: { url: "u" } }];
    expect(ruleTag(extractSignals(img))).toBe("vision");
    expect(ruleTag(extractSignals(chat("a".repeat(100))), { longContextChars: 50 })).toBe("long_context");
    expect(ruleTag(extractSignals(chat("short")))).toBeNull();
  });

  it("adds the previous user message to the classifier text only when there is history", () => {
    expect(buildClassifierText(extractSignals(chat("only")))).toBe("only");
    const body = { messages: [{ role: "user", content: "first" }, { role: "assistant", content: "a" }, { role: "user", content: "second" }] };
    expect(buildClassifierText(extractSignals(body))).toBe("first\n---\nsecond");
  });

  it("looks up tag:complexity, then tag, then default", () => {
    const routes = { code: "a", "code:high": "b" };
    expect(lookupRoute(routes, "code", "high", "d")).toBe("b");
    expect(lookupRoute(routes, "code", "low", "d")).toBe("a");
    expect(lookupRoute(routes, "chat", "low", "d")).toBe("d");
  });
});

describe("resolveSmartRoute", () => {
  it("only applies to the enabled virtual model", () => {
    expect(isSmartRoutingRequest(settings(), "auto")).toBe(true);
    expect(isSmartRoutingRequest(settings(), "cc/claude-opus-4-7")).toBe(false);
    expect(isSmartRoutingRequest(settings({ enabled: false }), "auto")).toBe(false);
  });

  it("routes by rule without calling the classifier", async () => {
    const fetchImpl = vi.fn();
    const r = await resolveSmartRoute({ body: chat("run it", { tools: [{}] }), settings: settings(), env, fetchImpl });
    expect(r).toMatchObject({ model: "agent-combo", tag: "agent", source: "rule" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses System One and the tag:complexity route", async () => {
    const r = await resolveSmartRoute({ body: chat("fix this deadlock #1"), settings: settings(), env, fetchImpl: classifierReply("code", 0.92, "high") });
    expect(r).toMatchObject({ model: "code-premium", tag: "code", complexity: "high", source: "typesafe" });
  });

  it("falls back to defaultTarget on low confidence", async () => {
    const r = await resolveSmartRoute({ body: chat("ambiguous #2"), settings: settings(), env, fetchImpl: classifierReply("code", 0.3) });
    expect(r).toMatchObject({ model: "always-on", source: "low-confidence" });
  });

  it("retries classification on the next turn after a low-confidence fallback, with more context", async () => {
    const keyRecord = { id: "k2" };
    const fetchImpl = vi.fn()
      .mockImplementationOnce(classifierReply("code", 0.3))
      .mockImplementationOnce(classifierReply("code", 0.95, "high"));
    const first = await resolveSmartRoute({ body: chat("do the thing #7"), settings: settings(), keyRecord, env, fetchImpl });
    expect(first).toMatchObject({ model: "always-on", source: "low-confidence" });
    const body2 = { model: "auto", messages: [{ role: "user", content: "do the thing #7" }, { role: "assistant", content: "which thing?" }, { role: "user", content: "refactor the SQL deadlock handler" }] };
    const second = await resolveSmartRoute({ body: body2, settings: settings(), keyRecord, env, fetchImpl });
    expect(second).toMatchObject({ model: "code-premium", source: "typesafe" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).state.user_message).toContain("do the thing #7");
  });

  it("drops a shaky complexity and uses the tag-only route", async () => {
    const r = await resolveSmartRoute({ body: chat("tricky #3"), settings: settings(), env, fetchImpl: classifierReply("code", 0.9, "high", 0.2) });
    expect(r).toMatchObject({ model: "code-cheap", complexity: null });
  });

  it("never throws: HTTP error, timeout and missing key all use defaultTarget", async () => {
    const httpError = vi.fn(async () => ({ ok: false, status: 500 }));
    const boom = vi.fn(async () => { throw new Error("timeout"); });
    for (const [fetchImpl, e] of [[httpError, env], [boom, env], [vi.fn(), {}]]) {
      const r = await resolveSmartRoute({ body: chat(`error case ${Math.random()}`), settings: settings(), env: e, fetchImpl });
      expect(r.model).toBe("always-on");
      expect(r.source).toMatch(/^classifier-error/);
    }
  });

  it("caches classifications and pins a conversation to its first decision", async () => {
    const fetchImpl = classifierReply("chat", 0.95);
    const keyRecord = { id: "k1" };
    const first = await resolveSmartRoute({ body: chat("pin me #4"), settings: settings(), keyRecord, env, fetchImpl });
    expect(first.model).toBe("cheap-fast");
    const body2 = { model: "auto", messages: [{ role: "user", content: "pin me #4" }, { role: "assistant", content: "ok" }, { role: "user", content: "now write a compiler" }] };
    const second = await resolveSmartRoute({ body: body2, settings: settings(), keyRecord, env, fetchImpl });
    expect(second).toMatchObject({ model: "cheap-fast", source: "pinned" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("respects the apiKeyIds allow-list", async () => {
    const r = await resolveSmartRoute({ body: chat("x #5"), settings: settings({ apiKeyIds: ["other"] }), keyRecord: { id: "k1" }, env, fetchImpl: vi.fn() });
    expect(r).toMatchObject({ model: "always-on", source: "key-not-allowed" });
  });

  it("returns an empty model when there is neither a route nor a default", async () => {
    const r = await resolveSmartRoute({ body: chat("x #6", { tools: [{}] }), settings: settings({ routes: {}, defaultTarget: "" }), env });
    expect(r.model).toBe("");
  });
});

describe("withRouteHeaders", () => {
  it("adds the decision as headers and keeps status and body", async () => {
    const out = withRouteHeaders(
      new Response("hello", { status: 201, headers: { "x-keep": "1" } }),
      { model: "code-premium", tag: "code", complexity: "high", confidence: 0.92, source: "classifier-error: boom" },
    );
    expect(out.status).toBe(201);
    expect(await out.text()).toBe("hello");
    expect(out.headers.get("x-keep")).toBe("1");
    expect(out.headers.get("X-Smart-Routing-Target")).toBe("code-premium");
    expect(out.headers.get("X-Smart-Routing-Tag")).toBe("code:high");
    expect(out.headers.get("X-Smart-Routing-Source")).toBe("classifier-error");
    expect(out.headers.get("X-Smart-Routing-Confidence")).toBe("0.92");
  });
});

describe("decision providers and keys", () => {
  const typesafe = getDecisionProvider("typesafe");

  it("knows the registered provider and rejects unknown or inherited names", () => {
    expect(typesafe.envKey).toBe("TYPESAFE_API_KEY");
    expect(getDecisionProvider("nope")).toBeNull();
    expect(getDecisionProvider("constructor")).toBeNull();
  });

  it("prefers the environment key over the admin-stored one", () => {
    const stored = { decisionApiKeys: { typesafe: "from-admin" } };
    expect(resolveDecisionApiKey({ settings: stored, provider: typesafe, env: { TYPESAFE_API_KEY: "from-env" } })).toEqual({ key: "from-env", source: "env" });
    expect(resolveDecisionApiKey({ settings: stored, provider: typesafe, env: {} })).toEqual({ key: "from-admin", source: "settings" });
    expect(resolveDecisionApiKey({ settings: {}, provider: typesafe, env: {} })).toEqual({ key: "", source: null });
  });

  it("reports key status without ever including the key", () => {
    const status = getDecisionKeyStatus({ decisionApiKeys: { typesafe: "secret-value" } }, {});
    expect(status.typesafe).toMatchObject({ configured: true, source: "settings", envKey: "TYPESAFE_API_KEY" });
    expect(JSON.stringify(status)).not.toContain("secret-value");
  });

  it("uses the admin-stored key when classifying and fails open for an unknown provider", async () => {
    const fetchImpl = classifierReply("chat", 0.95);
    const st = { ...settings(), decisionApiKeys: { typesafe: "admin-key" } };
    const ok = await resolveSmartRoute({ body: chat("admin key #8"), settings: st, env: {}, fetchImpl });
    expect(ok.model).toBe("cheap-fast");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer admin-key");

    const bad = await resolveSmartRoute({ body: chat("provider #9"), settings: settings({ provider: "ghost" }), env, fetchImpl });
    expect(bad).toMatchObject({ model: "always-on" });
    expect(bad.source).toMatch(/unknown decision provider/);
  });
});
