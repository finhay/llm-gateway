// Thin client for TypeSafe System One (POST /v1/systemone, Choice questions).

const EFFORT_HINTS = {
  low: "Direct answer, little or no deliberation needed",
  medium: "Some step-by-step thinking helps",
  high: "Hard problem: deep, careful reasoning needed",
};

export class DecisionError extends Error {
  /** @param {"no-api-key"|"timeout"|"provider-error"|"invalid-response"} code */
  constructor(code, message) {
    super(message);
    this.name = "DecisionError";
    this.code = code;
  }
}

function describeCandidate(c) {
  const caps = Object.entries(c.capabilities || {}).filter(([, on]) => on).map(([name]) => name);
  const parts = [
    c.description,
    `quality=${c.qualityTier}`,
    `latency=${c.latencyTier}`,
    `cost=${c.costTier}`,
    caps.length ? `supports ${caps.join(", ")}` : null,
    c.contextLimit ? `context=${c.contextLimit} tokens` : null,
  ];
  return parts.filter(Boolean).join("; ");
}

function buildPayload({ excerpt, candidates, efforts, weights, model }) {
  const w = `quality ${weights.quality}, latency ${weights.latency}, cost ${weights.cost} (higher means more important)`;
  return {
    model,
    state: {
      system_prompt: excerpt.system,
      conversation: excerpt.turns,
      optimization_weights: weights,
    },
    questions: {
      model: {
        type: "choice",
        instructions: `Which model should answer this conversation? Balance ${w}. Prefer the cheapest and fastest model that can answer well; pick a higher-quality model only when the task needs it.`,
        criteria: Object.fromEntries(candidates.map((c) => [c.id, describeCandidate(c)])),
      },
      effort: {
        type: "choice",
        instructions: "How much reasoning effort does a good answer to the latest message need?",
        criteria: Object.fromEntries(efforts.map((e) => [e, EFFORT_HINTS[e] ?? null])),
      },
    },
  };
}

/**
 * Ask the decision model to pick a candidate and a reasoning effort.
 * Always resolves to raw choices; the caller validates them against its own constraints.
 * @returns {Promise<{ choice: string, confidence: number, probabilities: object,
 *                     effort: string|null, effortConfidence: number|null, usage: object|null }>}
 * @throws {DecisionError}
 */
export async function decide({ excerpt, candidates, efforts, weights, apiKey, baseUrl, model = "jev-latest", timeoutMs = 800, fetchImpl = fetch }) {
  if (!apiKey) throw new DecisionError("no-api-key", "No API key configured for the decision provider");
  const root = (baseUrl || "https://api.typesafe.ai").replace(/\/+$/, "");

  let res;
  try {
    res = await fetchImpl(`${root}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildPayload({ excerpt, candidates, efforts, weights, model })),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new DecisionError(timedOut ? "timeout" : "provider-error", timedOut ? `No answer within ${timeoutMs}ms` : error.message);
  }
  if (!res.ok) throw new DecisionError("provider-error", `Decision provider HTTP ${res.status}`);

  let json;
  try {
    json = await res.json();
  } catch {
    throw new DecisionError("invalid-response", "Decision provider returned invalid JSON");
  }
  const picked = json?.answers?.model;
  if (typeof picked?.choice !== "string") throw new DecisionError("invalid-response", "Decision provider returned no model choice");
  const effort = json?.answers?.effort;
  return {
    choice: picked.choice,
    confidence: Number(picked.confidence) || 0,
    probabilities: picked.probabilities || {},
    effort: typeof effort?.choice === "string" ? effort.choice : null,
    effortConfidence: typeof effort?.choice === "string" ? Number(effort.confidence) || 0 : null,
    usage: json?.usage || null,
  };
}
