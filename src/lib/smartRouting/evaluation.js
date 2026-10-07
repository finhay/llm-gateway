// Offline comparison of the router against a fixed-model baseline. Pure: the script in
// scripts/smart-routing-eval.mjs does the I/O (dataset, calls to the decision provider).

const TIER_COST = { low: 1, medium: 3, high: 10 };

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const count = (items) => items.reduce((acc, k) => ({ ...acc, [k]: (acc[k] || 0) + 1 }), {});

/**
 * @param {{ decision: object, inputTokens: number, outputTokens: number, acceptable?: string[] }[]} rows
 * @param {{ candidates: object[], baseline: string, fallbackTarget?: string }} ctx
 *        candidates as returned by GET /api/smart-routing/candidates
 * @returns a report; costs are dollars when every candidate has a price, otherwise relative tier units
 */
export function summarize(rows, { candidates, baseline, fallbackTarget }) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  if (!byId.has(baseline)) throw new Error(`Baseline "${baseline}" is not one of the candidates, so it cannot be priced`);
  const priced = candidates.length > 0 && candidates.every((c) => c.costPerMTokens && typeof c.costPerMTokens.output === "number");

  const costOf = (id, inTokens, outTokens) => {
    const c = byId.get(id);
    if (priced) return (inTokens * c.costPerMTokens.input + outTokens * c.costPerMTokens.output) / 1e6;
    return TIER_COST[c.costTier] * ((inTokens + outTokens) / 1000);
  };

  // What the router would have run: its pick, or the baseline when it could not decide
  const routed = rows.map((r) => r.decision.selected || baseline);
  const sum = (ids) => ids.reduce((n, id, i) => n + costOf(id, rows[i].inputTokens, rows[i].outputTokens), 0);
  const routerCost = sum(routed);
  const baselineCost = sum(rows.map(() => baseline));

  const labelled = rows.map((r, i) => ({ r, id: routed[i] })).filter(({ r }) => Array.isArray(r.acceptable) && r.acceptable.length > 0);
  const rate = (pick) => (labelled.length ? labelled.filter(({ r, id }) => r.acceptable.includes(pick(id))).length / labelled.length : null);

  const decided = rows.filter((r) => r.decision.selected);
  const latencies = rows.map((r) => r.decision.decisionMs).filter((x) => typeof x === "number");
  const confidences = decided.map((r) => r.decision.confidence).filter((x) => typeof x === "number");
  const tierShare = (key) => count(routed.map((id) => byId.get(id)?.[key] || "unknown"));

  return {
    requests: rows.length,
    decided: decided.length,
    fallbackRate: rows.length ? 1 - decided.length / rows.length : null,
    fallbackReasons: count(rows.filter((r) => r.decision.fallbackReason).map((r) => r.decision.fallbackReason)),
    selection: count(routed),
    efforts: count(decided.map((r) => r.decision.effort || "none")),
    confidence: { mean: mean(confidences), p10: percentile(confidences, 10), p50: percentile(confidences, 50) },
    decisionLatencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    routerTokens: rows.reduce((n, r) => n + (r.decision.usage?.input_tokens || 0) + (r.decision.usage?.output_tokens || 0), 0),
    latencyTierMix: { router: tierShare("latencyTier"), baseline: { [byId.get(baseline)?.latencyTier || "unknown"]: rows.length } },
    cost: {
      basis: priced ? "usd" : "relative-tier-units",
      router: routerCost,
      baseline: baselineCost,
      savingsVsBaseline: baselineCost > 0 ? 1 - routerCost / baselineCost : null,
    },
    quality: {
      labelled: labelled.length,
      routerAcceptableRate: rate((id) => id),
      baselineAcceptableRate: rate(() => baseline),
    },
    note: fallbackTarget && fallbackTarget !== baseline
      ? `Rows the router could not decide are costed at the baseline (${baseline}), not at the fallback target (${fallbackTarget}).`
      : undefined,
  };
}
