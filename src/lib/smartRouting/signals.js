// What the router needs to know about a request. Pure functions, no I/O.

const TEXT_PART_TYPES = new Set(["text", "input_text", "output_text"]);
const IMAGE_PART_TYPES = new Set(["image_url", "image", "input_image"]);
const FILE_PART_TYPES = new Set(["file", "input_file", "document"]);

function partsToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => {
      if (typeof p === "string") return p;
      return TEXT_PART_TYPES.has(p?.type) || typeof p?.text === "string" ? p.text || "" : "";
    })
    .filter(Boolean)
    .join("\n");
}

const hasPartOfType = (content, types) =>
  Array.isArray(content) && content.some((p) => types.has(p?.type) || p?.inlineData || p?.inline_data);

// Normalize OpenAI chat, OpenAI Responses, Claude and Gemini bodies into [{ role, content }]
function getTurns(body) {
  if (Array.isArray(body?.messages)) return body.messages.map((m) => ({ role: m.role, content: m.content }));
  if (Array.isArray(body?.input)) return body.input.map((m) => ({ role: m.role || "user", content: m.content ?? m }));
  if (typeof body?.input === "string") return [{ role: "user", content: body.input }];
  if (Array.isArray(body?.contents)) {
    return body.contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts || [] }));
  }
  return [];
}

function getSystemText(body) {
  const sys = body?.system ?? body?.instructions ?? body?.systemInstruction?.parts;
  const fromField = partsToText(sys);
  if (fromField) return fromField;
  const turn = getTurns(body).find((t) => t.role === "system" || t.role === "developer");
  return turn ? partsToText(turn.content) : "";
}

function wantsStructuredOutput(body) {
  const type = body?.response_format?.type || body?.text?.format?.type;
  return type === "json_schema" || type === "json_object" || !!body?.generationConfig?.responseSchema;
}

/**
 * Hard requirements and size of a request, used to filter candidate models.
 * @returns {{ system: string, turns: {role: string, text: string}[], firstUser: string, totalChars: number,
 *             estimatedTokens: number, needsVision: boolean, needsTools: boolean, needsStructuredOutput: boolean }}
 */
export function extractSignals(body) {
  const raw = getTurns(body);
  const turns = raw
    .filter((t) => t.role !== "system" && t.role !== "developer")
    .map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", text: partsToText(t.content) }));
  const system = getSystemText(body);
  const totalChars = raw.reduce((n, t) => n + partsToText(t.content).length, 0) + system.length;
  return {
    system,
    turns,
    firstUser: turns.find((t) => t.role === "user")?.text || "",
    totalChars,
    estimatedTokens: Math.ceil(totalChars / 4),
    needsVision: raw.some((t) => hasPartOfType(t.content, IMAGE_PART_TYPES) || hasPartOfType(t.content, FILE_PART_TYPES)),
    needsTools: Array.isArray(body?.tools) && body.tools.length > 0,
    needsStructuredOutput: wantsStructuredOutput(body),
  };
}

/**
 * Bounded conversation excerpt for the decision model: the most recent turns that fit in
 * `maxChars` (the newest one always included, truncated if needed) and a short system prompt.
 * Raw prompts are sent only to the decision provider and are never logged or persisted.
 */
export function buildConversationExcerpt(signals, { maxChars = 4000, systemChars = 500, perTurnChars = 1500 } = {}) {
  const kept = [];
  let remaining = maxChars;
  for (let i = signals.turns.length - 1; i >= 0 && remaining > 0; i--) {
    const text = signals.turns[i].text.slice(0, Math.min(perTurnChars, remaining));
    kept.unshift({ role: signals.turns[i].role, text });
    remaining -= text.length;
  }
  return { system: signals.system.slice(0, systemChars), turns: kept };
}
