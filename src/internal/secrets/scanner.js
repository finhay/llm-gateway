import { DETECTORS } from "./registry.js";
import { fingerprint } from "@/internal/audit/index.js";
import { enabledDetectors } from "@/internal/policy/detectorOverrides.js";

function overlapsExisting(matches, start, end) {
  return matches.some((m) => start < m.end && end > m.start);
}

export function scanText(text, location = "", detectorOverrides = {}) {
  if (typeof text !== "string" || !text) return [];
  const matches = [];
  for (const detector of enabledDetectors(DETECTORS, detectorOverrides)) {
    for (const found of detector.scan(text) || []) {
      if (found.start == null || found.end == null || found.end <= found.start) continue;
      if (overlapsExisting(matches, found.start, found.end)) continue;
      matches.push({
        kind: detector.kind,
        type: detector.id,
        severity: detector.severity || "normal",
        classification: detector.classification || null,
        location,
        start: found.start,
        end: found.end,
        rawValue: found.match || text.slice(found.start, found.end),
        fingerprint: fingerprint(found.match || text.slice(found.start, found.end)),
      });
    }
  }
  return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function scanNodes(nodes, detectorOverrides = {}) {
  return nodes.flatMap((node) => scanText(node.value, node.path, detectorOverrides).map((match) => ({ ...match, node })));
}
