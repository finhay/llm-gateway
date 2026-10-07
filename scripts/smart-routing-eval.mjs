#!/usr/bin/env node
// Offline evaluation of the smart router against a fixed-model baseline (issue #6, Phase 1).
//
//   TYPESAFE_API_KEY=... node scripts/smart-routing-eval.mjs \
//     --dataset prompts.jsonl --candidates candidates.json --baseline cc/claude-sonnet-4-6 [--profile profile.json] \
//     [--output-tokens 400] [--concurrency 4] [--report report.json]
//
// dataset.jsonl   one JSON object per line: { "prompt": "..." } or { "messages": [...] }, optionally
//                 "tools": [...], "acceptable": ["cc/claude-haiku-4-5", ...] (models you would accept)
// candidates.json the response of GET /api/smart-routing/candidates (or just its "candidates" array)
// profile.json    the smartRouting settings to evaluate (weights, minConfidence, efforts, ...)
//
// It calls the real decision provider, so it costs a little. Dataset text goes to that provider only.

import { readFileSync, writeFileSync } from "node:fs";
import { decideRoute } from "../src/lib/smartRouting/index.js";
import { extractSignals } from "../src/lib/smartRouting/signals.js";
import { summarize } from "../src/lib/smartRouting/evaluation.js";

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

const a = args();
if (!a.dataset || !a.candidates || !a.baseline) {
  console.error("Usage: node scripts/smart-routing-eval.mjs --dataset f.jsonl --candidates c.json --baseline provider/model [--profile p.json] [--output-tokens 400] [--concurrency 4] [--report out.json]");
  process.exit(2);
}

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const candidatesFile = read(a.candidates);
const candidates = Array.isArray(candidatesFile) ? candidatesFile : candidatesFile.candidates;
const profile = a.profile ? read(a.profile) : {};
const outputTokens = Number(a["output-tokens"] || 400);
const concurrency = Math.max(1, Number(a.concurrency || 4));
const dataset = readFileSync(a.dataset, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

// Every candidate is treated as allowed and reachable: this measures the decision, not policy
const settings = { smartRouting: { enabled: true, fallbackTarget: a.baseline, ...profile } };

const rows = new Array(dataset.length);
let next = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < dataset.length) {
    const i = next++;
    const item = dataset[i];
    const body = { messages: item.messages || [{ role: "user", content: item.prompt }], tools: item.tools };
    const decision = await decideRoute({ body, settings, candidates, checkPolicy: async () => null });
    rows[i] = { decision, inputTokens: extractSignals(body).estimatedTokens, outputTokens, acceptable: item.acceptable };
  }
}));

const report = summarize(rows, { candidates, baseline: a.baseline, fallbackTarget: settings.smartRouting.fallbackTarget });
const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
console.log(`Requests ${report.requests}, decided ${report.decided}, fallback rate ${pct(report.fallbackRate)}`);
console.log("Fallback reasons:", report.fallbackReasons);
console.log("Router selection:", report.selection);
console.log("Reasoning efforts:", report.efforts);
console.log("Confidence:", report.confidence);
console.log("Decision latency (ms):", report.decisionLatencyMs, " router tokens:", report.routerTokens);
console.log(`Estimated cost (${report.cost.basis}): router ${report.cost.router.toFixed(4)} vs baseline ${report.cost.baseline.toFixed(4)} (savings ${pct(report.cost.savingsVsBaseline)})`);
console.log("Latency tier mix:", report.latencyTierMix);
console.log(`Quality on ${report.quality.labelled} labelled prompts: router ${pct(report.quality.routerAcceptableRate)}, baseline ${pct(report.quality.baselineAcceptableRate)}`);
if (report.note) console.log(report.note);
if (a.report) writeFileSync(a.report, JSON.stringify(report, null, 2));
