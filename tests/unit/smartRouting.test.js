/**
 * Unit tests for src/lib/smartRouting (Phase 1: shadow router)
 *
 *  - signals.js        request requirements and the bounded conversation excerpt
 *  - modelProfile.js   candidate pool built from reachable models (inference, include/exclude/overrides, cap)
 *  - candidates.js     capability / size / policy filtering
 *  - index.js          decideRoute(): confidence gate, invalid choice, fallbacks, headers
 *  - defaults.js       profile validation
 *  - providers.js      per-provider keys
 */

import { describe, it, expect, vi } from "vitest";
import { extractSignals, buildConversationExcerpt } from "../../src/lib/smartRouting/signals.js";
import { inferModelProfile, buildCandidatePool, limitPool, matchesAny } from "../../src/lib/smartRouting/modelProfile.js";
import { filterCandidates } from "../../src/lib/smartRouting/candidates.js";
import { decideRoute, isSmartRoutingRequest, withRouteHeaders, profileVersion } from "../../src/lib/smartRouting/index.js";
import { getSmartRoutingConfig, validateSmartRoutingConfig } from "../../src/lib/smartRouting/defaults.js";
import { getDecisionProvider, resolveDecisionApiKey, getDecisionKeyStatus } from "../../src/lib/smartRouting/providers.js";
import { summarize, percentile } from "../../src/lib/smartRouting/evaluation.js";

const cand = (id, over = {}) => ({
  id,
  provider: id.split("/")[0],
  qualityTier: "medium",
  latencyTier: "medium",
  costTier: "medium",
  capabilities: { vision: false, tools: true, structuredOutput: true },
  reasoningEfforts: [],
  ...over,
});

const POOL = [
  cand("cc/opus", { qualityTier: "high", costTier: "high", capabilities: { vision: true, tools: true, structuredOutput: true }, reasoningEfforts: ["low", "medium", "high"] }),
  cand("cc/haiku", { qualityTier: "low", costTier: "low", latencyTier: "low", capabilities: { vision: true, tools: true, structuredOutput: true } }),
  cand("cx/text-only", { capabilities: { vision: false, tools: true, structuredOutput: true } }),
];

const settings = (over = {}) => ({ smartRouting: { enabled: true, fallbackTarget: "always-on", ...over } });
const chat = (text, extra = {}) => ({ model: "auto/jev", messages: [{ role: "user", content: text }], ...extra });
const allow = async () => null;
const env = { TYPESAFE_API_KEY: "test-key" };

// A fetch that answers like System One
const jev = (choice, confidence = 0.9, effort = "high", effortConfidence = 0.8) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({
      answers: {
        model: { type: "choice", choice, confidence, probabilities: { [choice]: confidence } },
        effort: { type: "choice", choice: effort, confidence: effortConfidence },
      },
      usage: { input_tokens: 300, output_tokens: 30 },
    }),
  }));

const decide = (over = {}) =>
  decideRoute({ body: chat("explain this deadlock"), settings: settings(), candidates: POOL, checkPolicy: allow, env, fetchImpl: jev("cc/opus"), ...over });

describe("signals", () => {
  it("reads text and requirements from OpenAI chat, Responses, Claude and Gemini bodies", () => {
    expect(extractSignals(chat("hi")).firstUser).toBe("hi");
    expect(extractSignals({ input: "hello" }).turns).toEqual([{ role: "user", text: "hello" }]);
    const claude = extractSignals({ system: [{ type: "text", text: "be brief" }], messages: [{ role: "user", content: [{ type: "text", text: "yo" }] }] });
    expect(claude.system).toBe("be brief");
    expect(claude.firstUser).toBe("yo");
    expect(extractSignals({ contents: [{ role: "user", parts: [{ text: "gem" }] }] }).firstUser).toBe("gem");
  });

  it("flags vision, tools and structured output", () => {
    expect(extractSignals(chat("x", { tools: [{}] })).needsTools).toBe(true);
    expect(extractSignals(chat("x", { response_format: { type: "json_schema" } })).needsStructuredOutput).toBe(true);
    const img = chat("x");
    img.messages[0].content = [{ type: "image_url", image_url: { url: "u" } }];
    expect(extractSignals(img).needsVision).toBe(true);
    expect(extractSignals(chat("plain"))).toMatchObject({ needsVision: false, needsTools: false, needsStructuredOutput: false });
  });

  it("keeps the newest turns within the character budget and always the latest one", () => {
    const s = extractSignals({ messages: [{ role: "user", content: "a".repeat(100) }, { role: "assistant", content: "b".repeat(100) }, { role: "user", content: "latest" }] });
    const ex = buildConversationExcerpt(s, { maxChars: 110 });
    expect(ex.turns.at(-1).text).toBe("latest");
    expect(ex.turns.reduce((n, t) => n + t.text.length, 0)).toBeLessThanOrEqual(110);
  });
});

describe("candidate pool from reachable models", () => {
  const models = [
    { id: "cc/claude-opus-4-7", provider: "claude", pricing: { input: 5, output: 25 } },
    { id: "cc/claude-haiku-4-5", provider: "claude", pricing: { input: 1, output: 5 } },
    { id: "gh/gpt-4o-mini", provider: "github", pricing: { input: 0.15, output: 0.6 } },
    { id: "gc/gemini-2.5-pro", provider: "gemini-cli" },
  ];
  const cfg = (over = {}) => ({ efforts: ["low", "medium", "high"], maxCandidates: 40, ...over });

  it("infers tiers from names and relative price", () => {
    const pool = Object.fromEntries(buildCandidatePool(models, cfg()).map((c) => [c.id, c]));
    expect(pool["cc/claude-opus-4-7"]).toMatchObject({ qualityTier: "high", costTier: "high", provider: "claude" });
    expect(pool["cc/claude-haiku-4-5"]).toMatchObject({ qualityTier: "low", latencyTier: "low" });
    expect(pool["gh/gpt-4o-mini"].costTier).toBe("low");
    expect(pool["gc/gemini-2.5-pro"].costTier).toBe("medium"); // unknown price
    expect(inferModelProfile({ id: "x/gemini-1.5" }).qualityTier).not.toBe("low"); // "mini" inside "gemini" is not a small model
  });

  it("applies include, exclude and per-model overrides", () => {
    expect(buildCandidatePool(models, cfg({ exclude: ["gh/*"] })).map((c) => c.id)).not.toContain("gh/gpt-4o-mini");
    expect(buildCandidatePool(models, cfg({ include: ["cc/*"] })).map((c) => c.id).sort()).toEqual(["cc/claude-haiku-4-5", "cc/claude-opus-4-7"]);
    const overridden = buildCandidatePool(models, cfg({ overrides: { "cc/claude-haiku-4-5": { qualityTier: "high", capabilities: { vision: false } }, "gc/gemini-2.5-pro": { exclude: true } } }));
    expect(overridden.find((c) => c.id === "cc/claude-haiku-4-5")).toMatchObject({ qualityTier: "high", capabilities: { vision: false, tools: true } });
    expect(overridden.map((c) => c.id)).not.toContain("gc/gemini-2.5-pro");
    expect(matchesAny("cc/claude-opus-4-7", ["*/claude-*"])).toBe(true);
  });

  it("only keeps efforts that belong to the profile's closed set", () => {
    const pool = buildCandidatePool(models, cfg({ efforts: ["low", "high"] }));
    expect(pool.find((c) => c.id === "cc/claude-opus-4-7").reasoningEfforts).toEqual(["low", "high"]);
  });

  it("caps the pool while spreading it over quality and cost", () => {
    const many = Array.from({ length: 30 }, (_, i) => cand(`p/m${i}`, { qualityTier: ["low", "medium", "high"][i % 3], costTier: ["low", "medium", "high"][Math.floor(i / 3) % 3] }));
    const limited = limitPool(many, 9);
    expect(limited).toHaveLength(9);
    expect(new Set(limited.map((c) => `${c.qualityTier}:${c.costTier}`)).size).toBe(9);
  });
});

describe("candidate filtering", () => {
  it("drops candidates that lack a required capability or cannot fit the context", async () => {
    const withImage = chat("x");
    withImage.messages[0].content = [{ type: "image_url", image_url: { url: "u" } }];
    const { eligible, rejected } = await filterCandidates(POOL, extractSignals(withImage), allow);
    expect(eligible.map((c) => c.id)).toEqual(["cc/opus", "cc/haiku"]);
    expect(rejected).toEqual([{ id: "cx/text-only", reason: "no-vision" }]);

    const big = await filterCandidates([cand("a/small", { contextLimit: 10 })], extractSignals(chat("x".repeat(400))), allow);
    expect(big.rejected[0].reason).toBe("context-too-small");
  });

  it("never offers a candidate that policy rejects", async () => {
    const policy = async (c) => (c.provider === "cc" ? "key-policy" : null);
    const { eligible, rejected } = await filterCandidates(POOL, extractSignals(chat("x")), policy);
    expect(eligible.map((c) => c.id)).toEqual(["cx/text-only"]);
    expect(rejected.map((r) => r.reason)).toEqual(["key-policy", "key-policy"]);
  });
});

describe("decideRoute", () => {
  it("only applies to the enabled virtual model", () => {
    expect(isSmartRoutingRequest(settings(), "auto/jev")).toBe(true);
    expect(isSmartRoutingRequest(settings(), "cc/opus")).toBe(false);
    expect(isSmartRoutingRequest(settings({ enabled: false }), "auto/jev")).toBe(false);
  });

  it("returns the chosen model and a supported reasoning effort, served by the fallback target (shadow)", async () => {
    const fetchImpl = jev("cc/opus", 0.92, "high");
    const d = await decide({ fetchImpl });
    expect(d).toMatchObject({ mode: "shadow", executed: "always-on", selected: "cc/opus", effort: "high", confidence: 0.92, source: "typesafe", fallbackReason: null });
    expect(d.usage).toEqual({ input_tokens: 300, output_tokens: 30 });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(Object.keys(sent.questions.model.criteria)).toEqual(["cc/opus", "cc/haiku", "cx/text-only"]);
    expect(Object.keys(sent.questions.effort.criteria)).toEqual(["low", "medium", "high"]);
  });

  it("drops an effort the chosen model does not support", async () => {
    const d = await decide({ fetchImpl: jev("cc/haiku", 0.9, "high") });
    expect(d).toMatchObject({ selected: "cc/haiku", effort: null });
  });

  it("rejects a choice that was never offered and records it as suggested", async () => {
    const d = await decide({ fetchImpl: jev("openai/gpt-9") });
    expect(d).toMatchObject({ selected: null, suggested: "openai/gpt-9", fallbackReason: "invalid-choice", executed: "always-on" });
  });

  it("rejects a candidate that was filtered out even if the model returns it", async () => {
    const policy = async (c) => (c.id === "cc/opus" ? "dlp-policy" : null);
    const d = await decide({ checkPolicy: policy, fetchImpl: jev("cc/opus") });
    expect(d).toMatchObject({ selected: null, fallbackReason: "invalid-choice" });
    expect(d.rejected).toEqual([{ id: "cc/opus", reason: "dlp-policy" }]);
  });

  it("falls back on low confidence", async () => {
    const d = await decide({ fetchImpl: jev("cc/opus", 0.3) });
    expect(d).toMatchObject({ selected: null, suggested: "cc/opus", fallbackReason: "low-confidence", confidence: 0.3 });
  });

  it("falls back, never throws, on timeout, HTTP error, bad JSON, bad shape and a missing key", async () => {
    const timeout = vi.fn(async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; });
    const http = vi.fn(async () => ({ ok: false, status: 529 }));
    const badJson = vi.fn(async () => ({ ok: true, json: async () => { throw new Error("x"); } }));
    const badShape = vi.fn(async () => ({ ok: true, json: async () => ({ answers: {} }) }));
    const cases = [[timeout, env, "timeout"], [http, env, "provider-error"], [badJson, env, "invalid-response"], [badShape, env, "invalid-response"], [vi.fn(), {}, "no-api-key"]];
    for (const [fetchImpl, e, reason] of cases) {
      const d = await decide({ fetchImpl, env: e });
      expect(d.fallbackReason).toBe(reason);
      expect(d.executed).toBe("always-on");
    }
  });

  it("skips the external call when only one candidate is eligible and fails over when none is", async () => {
    const fetchImpl = jev("cc/opus");
    const one = await decide({ candidates: [POOL[0]], fetchImpl });
    expect(one).toMatchObject({ source: "single-candidate", selected: "cc/opus", effort: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    const none = await decide({ checkPolicy: async () => "unavailable", fetchImpl });
    expect(none).toMatchObject({ fallbackReason: "no-eligible-candidates", selected: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the admin-stored key and reports an unknown provider as a fallback", async () => {
    const fetchImpl = jev("cc/opus");
    await decide({ settings: { ...settings(), decisionApiKeys: { typesafe: "admin-key" } }, env: {}, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer admin-key");
    const d = await decide({ settings: settings({ provider: "ghost" }) });
    expect(d.fallbackReason).toBe("unknown-provider");
  });

  it("respects the apiKeyIds allow-list", async () => {
    const d = await decide({ settings: settings({ apiKeyIds: ["other"] }), keyRecord: { id: "k1" } });
    expect(d.fallbackReason).toBe("key-not-allowed");
  });

  it("does not record prompt text and versions the profile", async () => {
    const d = await decide({ body: chat("my secret prompt text") });
    expect(JSON.stringify(d)).not.toContain("secret prompt");
    expect(d.version).toBe(profileVersion(getSmartRoutingConfig(settings())));
    expect(profileVersion(getSmartRoutingConfig(settings({ minConfidence: 0.9 })))).not.toBe(d.version);
  });
});

describe("withRouteHeaders", () => {
  const decision = { mode: "shadow", executed: "always-on", selected: "cc/opus", effort: "high", confidence: 0.92, source: "typesafe", fallbackReason: null };

  it("describes both what served the request and what the router would have chosen", async () => {
    const out = withRouteHeaders(new Response("hello", { status: 201, headers: { "x-keep": "1" } }), decision, "cx/gpt-5.5");
    expect(out.status).toBe(201);
    expect(await out.text()).toBe("hello");
    expect(out.headers.get("x-keep")).toBe("1");
    expect(out.headers.get("X-Smart-Routing-Mode")).toBe("shadow");
    expect(out.headers.get("X-Smart-Routing-Target")).toBe("always-on");
    expect(out.headers.get("X-Smart-Routing-Model")).toBe("cx/gpt-5.5");
    expect(out.headers.get("X-Smart-Routing-Shadow-Choice")).toBe("cc/opus");
    expect(out.headers.get("X-Smart-Routing-Shadow-Effort")).toBe("high");
    expect(out.headers.get("X-Smart-Routing-Confidence")).toBe("0.92");
  });

  it("marks fallbacks with their reason", () => {
    const out = withRouteHeaders(new Response("x"), { ...decision, selected: null, effort: null, confidence: null, fallbackReason: "timeout" });
    expect(out.headers.get("X-Smart-Routing-Source")).toBe("fallback:timeout");
    expect(out.headers.get("X-Smart-Routing-Shadow-Choice")).toBeNull();
    expect(out.headers.get("X-Smart-Routing-Model")).toBeNull();
  });
});

describe("profile validation", () => {
  const valid = (over = {}) => getSmartRoutingConfig({ smartRouting: { fallbackTarget: "always-on", ...over } });

  it("accepts the defaults and a typical profile", () => {
    expect(validateSmartRoutingConfig(valid())).toBeNull();
    expect(validateSmartRoutingConfig(valid({ enabled: true, exclude: ["gh/*"], overrides: { "cc/opus": { qualityTier: "high", reasoningEfforts: ["low"] } } }))).toBeNull();
  });

  it("rejects bad values with a readable reason", () => {
    expect(validateSmartRoutingConfig(valid({ enabled: true, fallbackTarget: "" }))).toMatch(/fallbackTarget/);
    expect(validateSmartRoutingConfig(valid({ mode: "enforce" }))).toMatch(/mode/);
    expect(validateSmartRoutingConfig(valid({ minConfidence: 2 }))).toMatch(/minConfidence/);
    expect(validateSmartRoutingConfig(valid({ weights: { quality: 0, latency: 0, cost: 0 } }))).toMatch(/weights/);
    expect(validateSmartRoutingConfig(valid({ overrides: { "cc/opus": { qualityTier: "great" } } }))).toMatch(/qualityTier/);
    expect(validateSmartRoutingConfig(valid({ overrides: { "cc/opus": { reasoningEfforts: ["extreme"] } } }))).toMatch(/reasoningEfforts/);
    expect(validateSmartRoutingConfig(valid({ exclude: [""] }))).toMatch(/exclude/);
  });

  it("completes a partially stored profile with defaults", () => {
    const cfg = getSmartRoutingConfig({ smartRouting: { weights: { cost: 1 } } });
    expect(cfg.weights).toEqual({ quality: 0.5, latency: 0.25, cost: 1 });
    expect(cfg.virtualModel).toBe("auto/jev");
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
});

describe("offline evaluation", () => {
  const priced = [
    { id: "a/small", latencyTier: "low", costTier: "low", costPerMTokens: { input: 1, output: 5 } },
    { id: "a/big", latencyTier: "high", costTier: "high", costPerMTokens: { input: 5, output: 25 } },
  ];
  const row = (selected, extra = {}) => ({ decision: { selected, confidence: 0.9, effort: "low", decisionMs: 100, usage: { input_tokens: 10, output_tokens: 2 }, ...extra }, inputTokens: 1000, outputTokens: 1000, acceptable: ["a/small", "a/big"] });

  it("compares cost and quality with the baseline, costing undecided rows at the baseline", () => {
    const rows = [row("a/small"), row("a/small"), row(null, { fallbackReason: "timeout", confidence: null, effort: null })];
    const r = summarize(rows, { candidates: priced, baseline: "a/big", fallbackTarget: "combo" });
    expect(r).toMatchObject({ requests: 3, decided: 2, cost: { basis: "usd" }, fallbackReasons: { timeout: 1 }, selection: { "a/small": 2, "a/big": 1 } });
    expect(r.cost.baseline).toBeCloseTo(3 * 0.03, 6);
    expect(r.cost.router).toBeCloseTo(2 * 0.006 + 0.03, 6);
    expect(r.cost.savingsVsBaseline).toBeGreaterThan(0.5);
    expect(r.quality).toEqual({ labelled: 3, routerAcceptableRate: 1, baselineAcceptableRate: 1 });
    expect(r.decisionLatencyMs).toEqual({ p50: 100, p95: 100 });
    expect(r.note).toMatch(/combo/);
  });

  it("falls back to relative tier units when a candidate has no price and rejects an unknown baseline", () => {
    const unpriced = [{ ...priced[0], costPerMTokens: undefined }, priced[1]];
    expect(summarize([row("a/small")], { candidates: unpriced, baseline: "a/big" }).cost.basis).toBe("relative-tier-units");
    expect(() => summarize([row("a/small")], { candidates: priced, baseline: "x/none" })).toThrow(/Baseline/);
  });

  it("computes percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 50)).toBeNull();
  });
});
