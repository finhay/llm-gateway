// Prompt signals + deterministic tags for smart routing. Pure functions, no I/O.

const TEXT_PART_TYPES = new Set(["text", "input_text", "output_text"]);
const IMAGE_PART_TYPES = new Set(["image_url", "image", "input_image"]);

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

function hasImagePart(content) {
  return Array.isArray(content) && content.some((p) => IMAGE_PART_TYPES.has(p?.type) || p?.inlineData || p?.inline_data);
}

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

/**
 * Extract what the router needs from a request body.
 * @returns {{ system: string, lastUser: string, prevUser: string, firstUser: string, totalChars: number, hasTools: boolean, hasImages: boolean }}
 */
export function extractSignals(body) {
  const turns = getTurns(body);
  const userTurns = turns.filter((t) => t.role === "user");
  const system = getSystemText(body);
  const totalChars = turns.reduce((n, t) => n + partsToText(t.content).length, 0) + system.length;
  return {
    system,
    lastUser: partsToText(userTurns.at(-1)?.content),
    prevUser: userTurns.length > 1 ? partsToText(userTurns.at(-2)?.content) : "",
    firstUser: partsToText(userTurns[0]?.content),
    totalChars,
    hasTools: Array.isArray(body?.tools) && body.tools.length > 0,
    hasImages: turns.some((t) => hasImagePart(t.content)),
  };
}

/**
 * Free, instant tags decided from request shape alone. Returns null when the
 * prompt needs the classifier.
 */
export function ruleTag(signals, { longContextChars = 48000 } = {}) {
  if (signals.hasImages) return "vision";
  if (signals.hasTools) return "agent";
  if (signals.totalChars > longContextChars) return "long_context";
  return null;
}

// "<tag>:<complexity>" -> "<tag>" -> defaultTarget
export function lookupRoute(routes, tag, complexity, defaultTarget = "") {
  const table = routes || {};
  return (complexity && table[`${tag}:${complexity}`]) || table[tag] || defaultTarget || "";
}

/**
 * Text sent to the classifier: the latest user message, plus the one before it when the
 * conversation has history (a short follow-up like "do it again" is unclear on its own).
 * Truncated to `max` chars, the latest message getting the larger share.
 */
export function buildClassifierText(signals, max = 2000) {
  if (!signals.prevUser) return signals.lastUser.slice(0, max);
  const prevShare = Math.floor(max / 4);
  return `${signals.prevUser.slice(0, prevShare)}\n---\n${signals.lastUser.slice(0, max - prevShare)}`;
}
