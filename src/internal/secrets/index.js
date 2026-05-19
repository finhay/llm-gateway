import { walkTextNodes } from "@/internal/walker/walkTextNodes.js";
import { scanNodes, scanText } from "./scanner.js";
import { applyRedactions, redactText } from "./redactor.js";

export function scanRequestBody(body, format, settings = {}) {
  const nodes = walkTextNodes(body, format);
  const matches = scanNodes(nodes, settings.detectorOverrides || {});
  const criticalHit = matches.find((match) => match.severity === "critical") || null;
  return {
    nodes,
    matches,
    criticalHit,
    didRedact: false,
    redact() {
      const count = applyRedactions(nodes, matches.filter((match) => match.severity !== "critical"));
      this.didRedact = count > 0;
      return count;
    },
  };
}

export { scanNodes, scanText, applyRedactions, redactText };
