// Thin client for TypeSafe System One (POST /v1/systemone, Choice questions).

export const TAGS = {
  code: "Writing, fixing, reviewing or explaining source code, SQL, shell or config",
  reasoning: "Multi-step math, logic, planning, analysis or deep technical problem solving",
  chat: "Casual conversation, simple factual questions, short answers",
  summarize_translate: "Summarizing, rewriting, extracting from or translating given text",
  creative: "Creative writing, brainstorming, marketing copy, storytelling",
  other: "Anything that does not clearly fit the other options",
};

export const COMPLEXITY = {
  low: "Simple and short; a small fast model answers it well",
  medium: "Needs some care or several steps",
  high: "Hard, ambiguous or high-stakes; needs the strongest model",
};

function buildPayload({ system, text, model }) {
  return {
    model,
    state: { system_prompt: system || "", user_message: text },
    questions: {
      tag: { type: "choice", instructions: "What kind of task is the user message?", criteria: TAGS },
      complexity: { type: "choice", instructions: "How demanding is answering the user message well?", criteria: COMPLEXITY },
    },
  };
}

/**
 * @returns {Promise<{ tag: string, confidence: number, complexity: string|null, complexityConfidence: number|null }>}
 * @throws on timeout, HTTP error or malformed response (callers must fall back)
 */
export async function classify({ text, system = "", apiKey, baseUrl, model = "jev-latest", timeoutMs = 800, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  const root = (baseUrl || "https://api.typesafe.ai").replace(/\/+$/, "");
  const res = await fetchImpl(`${root}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildPayload({ system, text, model })),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`System One HTTP ${res.status}`);
  const answers = (await res.json())?.answers;
  const tag = answers?.tag;
  if (!tag?.choice || !(tag.choice in TAGS)) throw new Error("System One returned no valid tag");
  const complexity = answers?.complexity;
  const complexityOk = !!complexity && complexity.choice in COMPLEXITY;
  return {
    tag: tag.choice,
    confidence: Number(tag.confidence) || 0,
    complexity: complexityOk ? complexity.choice : null,
    complexityConfidence: complexityOk ? Number(complexity.confidence) || 0 : null,
  };
}
