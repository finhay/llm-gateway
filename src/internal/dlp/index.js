import { walkTextNodes } from "@/internal/walker/walkTextNodes.js";
import { applyRedactions, redactText } from "@/internal/secrets/redactor.js";
import { scanNodes, scanText } from "./scanner.js";
import { classifyDlp } from "./classifier.js";

export function scanRequestBody(body, format, settings = {}) {
  const nodes = walkTextNodes(body, format);
  const matches = scanNodes(nodes, settings.customDlpPatterns || [], settings.detectorOverrides || {});
  const classification = classifyDlp(matches);
  return {
    nodes,
    matches,
    classification,
    didRedact: false,
    redact() {
      const count = applyRedactions(nodes, matches);
      this.didRedact = count > 0;
      return count;
    },
  };
}

export { scanNodes, scanText, classifyDlp, applyRedactions, redactText };
