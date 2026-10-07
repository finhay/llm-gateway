import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { getSmartRoutingConfig } from "@/lib/smartRouting/defaults.js";
import { getDecisionProvider, resolveDecisionApiKey, DECISION_PROVIDERS } from "@/lib/smartRouting/providers.js";

export const dynamic = "force-dynamic";

const SAMPLE_TEXT = "Write a SQL query that returns the ten customers with the highest total order value.";

// POST /api/smart-routing/test  { provider?, apiKey? }
// Checks that a key works with its provider by running one real classification.
// The key is used for this call only (not saved) and is never echoed back.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = await getSettings();
    const cfg = getSmartRoutingConfig(settings);

    const providerId = body.provider || cfg.provider;
    const provider = getDecisionProvider(providerId);
    if (!provider) {
      return NextResponse.json(
        { ok: false, error: `Unknown decision provider "${providerId}". Available: ${Object.keys(DECISION_PROVIDERS).join(", ")}` },
        { status: 400 }
      );
    }

    const typed = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const resolved = typed ? { key: typed, source: "request" } : resolveDecisionApiKey({ settings, provider });
    if (!resolved.key) {
      return NextResponse.json(
        { ok: false, provider: provider.id, error: `No API key for ${provider.label}. Enter one or set ${provider.envKey}.` },
        { status: 400 }
      );
    }

    const started = Date.now();
    try {
      const result = await provider.classify({
        text: SAMPLE_TEXT,
        apiKey: resolved.key,
        baseUrl: cfg.baseUrl || process.env[provider.envBaseUrlKey] || undefined,
        model: cfg.model || provider.defaultModel,
        timeoutMs: 8000,
      });
      return NextResponse.json({
        ok: true,
        provider: provider.id,
        keySource: resolved.source,
        tag: result.tag,
        confidence: result.confidence,
        ms: Date.now() - started,
      });
    } catch (error) {
      return NextResponse.json({ ok: false, provider: provider.id, keySource: resolved.source, error: error.message, ms: Date.now() - started });
    }
  } catch (error) {
    console.log("Error testing decision provider:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
