import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { getSmartRoutingConfig } from "@/lib/smartRouting/defaults.js";
import { discoverCandidates, resetCandidateCache } from "@/sse/services/candidateDiscovery.js";

export const dynamic = "force-dynamic";

// GET /api/smart-routing/candidates[?refresh=1]
// The models the router can currently choose from (connected providers, minus disabled models,
// shaped by include/exclude/overrides), with the metadata that was inferred for each.
// Per-request policy (API key allowlist, DLP, provider availability) is applied later, per request.
export async function GET(request) {
  try {
    if (new URL(request.url).searchParams.get("refresh")) resetCandidateCache();
    const cfg = getSmartRoutingConfig(await getSettings());
    const candidates = await discoverCandidates(cfg);
    return NextResponse.json({
      count: candidates.length,
      maxCandidates: cfg.maxCandidates,
      candidates: candidates.map(({ id, provider, qualityTier, latencyTier, costTier, capabilities, reasoningEfforts, contextLimit, costPerMTokens }) => (
        { id, provider, qualityTier, latencyTier, costTier, capabilities, reasoningEfforts, contextLimit, costPerMTokens }
      )),
    });
  } catch (error) {
    console.log("Error discovering router candidates:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
