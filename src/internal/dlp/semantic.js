import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { redactText } from "@/internal/secrets/redactor.js";
import { isConversationPath } from "@/internal/walker/walkTextNodes.js";

// Regex detectors whose hits are verified in context before they restrict routing.
// Their patterns (any 12-digit number, any 10-16 digits near "account") over-match
// order IDs, timestamps and code identifiers.
const VERIFIED_TYPES = {
  national_id: "a real person's government identity number (a US Social Security number or a Vietnamese CCCD citizen ID number)",
  bank_account: "a real bank account number or IBAN",
};

const NOT_PII = [
  "order, invoice, ticket or transaction numbers",
  "timestamps, dates and durations",
  "phone numbers",
  "database row IDs, code identifiers, hashes, version or build numbers",
  "numbers inside source code, logs or generated data that do not identify a person or account",
];

const CONTEXT_CHARS = 240;
const MAX_CANDIDATES = 24;
const MAX_CONVERSATION_CHARS = 32_000;
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_DISMISS_BELOW = 0.2;
const DEFAULT_CONTENT_THRESHOLD = 0.5;

let cached = null;

export function resolveTypesafeApiKey(cfg = {}) {
  const fromSettings = typeof cfg.typesafeApiKey === "string" ? cfg.typesafeApiKey.trim() : "";
  return fromSettings || process.env.TYPESAFE_API_KEY?.trim() || null;
}

function clientFor(apiKey) {
  if (cached?.apiKey !== apiKey) {
    cached = { apiKey, client: new TypeSafeClient({ apiKey, timeout: DEFAULT_TIMEOUT_MS, retry: { maxRetries: 1 } }) };
  }
  return cached.client;
}

function groupByNode(matches) {
  const byNode = new Map();
  for (const match of matches) {
    if (!match.node) continue;
    if (!byNode.has(match.node)) byNode.set(match.node, []);
    byNode.get(match.node).push(match);
  }
  return byNode;
}

// Text around the candidate, with every other detector hit (secrets and DLP) masked,
// so only the value under judgment leaves the gateway unredacted.
function contextFor(match, nodeMatches) {
  const text = match.node.value;
  const others = nodeMatches.filter((other) => other !== match);
  let start = Math.max(0, match.start - CONTEXT_CHARS);
  let end = Math.min(text.length, match.end + CONTEXT_CHARS);
  // Widen to whole hits so no secret is cut in half and left partly unmasked.
  for (const other of others) {
    if (other.start < start && other.end > start) start = other.start;
    if (other.start < end && other.end > end) end = other.end;
  }
  const inWindow = others
    .filter((other) => other.start >= start && other.end <= end)
    .map((other) => ({ ...other, start: other.start - start, end: other.end - start }));
  return `${start > 0 ? "…" : ""}${redactText(text.slice(start, end), inWindow)}${end < text.length ? "…" : ""}`;
}

// One question per distinct (detector, value); every match sharing it gets the same answer.
function buildCandidateQuestions(matches, byNode) {
  const groups = new Map();
  for (const match of matches) {
    const key = `${match.type}\u0000${match.rawValue}`;
    if (!groups.has(key)) {
      if (groups.size >= MAX_CANDIDATES) continue;
      groups.set(key, { id: `c${groups.size}`, matches: [] });
    }
    groups.get(key).matches.push(match);
  }

  const candidates = {};
  const questions = {};
  for (const group of groups.values()) {
    const first = group.matches[0];
    candidates[group.id] = { value: first.rawValue, context: contextFor(first, byNode.get(first.node)) };
    questions[group.id] = noul(
      {
        task: `Is \`candidates.${group.id}.value\` ${VERIFIED_TYPES[first.type]}, judging by how it is used in \`candidates.${group.id}.context\`?`,
        not_this: NOT_PII,
      },
      {
        true: "It identifies a real person or their bank account and should be treated as customer PII.",
        false: "It is some other kind of number that only happens to have the same digit pattern.",
      }
    );
  }
  return { groups: [...groups.values()], candidates, questions };
}

// Most recent conversation text first, with every detector hit already redacted,
// so the classifier never sees the raw secrets or PII the scanners found.
function buildConversation(conversationNodes, byNode) {
  const parts = [];
  let size = 0;
  for (let i = conversationNodes.length - 1; i >= 0 && size < MAX_CONVERSATION_CHARS; i--) {
    const node = conversationNodes[i];
    const text = redactText(node.value, byNode.get(node) || []);
    const part = text.slice(-(MAX_CONVERSATION_CHARS - size));
    parts.push({ location: node.path, text: part });
    size += part.length;
  }
  return parts.reverse();
}

const CONTENT_QUESTIONS = {
  credentials: noul(
    {
      task: "Does `conversation` contain working access credentials for a real system?",
      includes: ["passwords", "API keys and access tokens", "private keys", "connection strings with embedded passwords", "one-time codes"],
      excludes: [
        "credentials discussed only in general terms",
        "placeholders such as `<API_KEY>`, `sk-xxx` or `changeme`",
        "values already replaced by [REDACTED_…] markers",
      ],
    },
    {
      true: "At least one usable credential appears in the conversation.",
      false: "No usable credential appears in the conversation.",
    }
  ),
  source_code_private: noul(
    {
      task: "Does `conversation` include proprietary source code or internal technical material belonging to the user's organization?",
      includes: ["files from the organization's own repositories", "internal service or business-logic code", "internal infrastructure or deployment configuration"],
      excludes: [
        "generic snippets or short examples written to illustrate a question",
        "public open-source library code",
        "prose without code",
      ],
    },
    {
      true: "The conversation exposes the organization's private code or internal configuration.",
      false: "The conversation contains no private code or internal configuration.",
    }
  ),
};

function contentFinding(label) {
  return {
    kind: "dlp",
    type: `semantic_${label}`,
    severity: "high",
    classification: label,
    location: "conversation",
    action: "logged",
    ruleId: "semantic-classification",
  };
}

/**
 * Ask TypeSafe, in one request, to (1) verify noisy PII regex hits in the conversation
 * and (2) classify the conversation for credentials or private source code.
 *
 * Fails safe: when disabled, unconfigured, or erroring, nothing is dismissed and
 * nothing is added, which leaves the regex-only behavior unchanged.
 *
 * @returns {Promise<{ dismissed: Set<object>, findings: object[] }>} regex matches to
 *   downgrade to "logged", and match-shaped content classifications to audit.
 */
export async function runSemanticChecks({ cfg = {}, matches = [], nodes = [] }) {
  const empty = { dismissed: new Set(), findings: [] };
  const verify = cfg.semanticPiiVerification === true;
  const classify = cfg.semanticContentClassification === true;
  if (!verify && !classify) return empty;
  const apiKey = resolveTypesafeApiKey(cfg);
  if (!apiKey) return empty;

  const conversationPii = matches.filter((match) => match.classification === "customer_pii" && isConversationPath(match.location));
  const toVerify = verify ? conversationPii.filter((match) => VERIFIED_TYPES[match.type]) : [];
  // PII we cannot dismiss already restricts routing as tightly as a content label would.
  const skipContent = toVerify.length < conversationPii.length;

  const byNode = groupByNode(matches);
  const { groups, candidates, questions } = buildCandidateQuestions(toVerify, byNode);
  const state = {};
  if (groups.length) state.candidates = candidates;
  if (classify && !skipContent) {
    const conversationNodes = nodes.filter((node) => isConversationPath(node.path));
    if (conversationNodes.length) {
      state.conversation = buildConversation(conversationNodes, byNode);
      Object.assign(questions, CONTENT_QUESTIONS);
    }
  }
  if (!Object.keys(questions).length) return empty;

  let answers;
  try {
    ({ answers } = await clientFor(apiKey).systemOne({ state, questions }));
  } catch (error) {
    console.warn(`[SECURITY] TypeSafe semantic check failed; using regex results only: ${error.message}`);
    return empty;
  }

  const dismissBelow = Number(cfg.semanticPiiDismissBelow ?? DEFAULT_DISMISS_BELOW);
  const dismissed = new Set();
  for (const group of groups) {
    if (answers[group.id]?.noul < dismissBelow) group.matches.forEach((match) => dismissed.add(match));
  }

  const contentThreshold = Number(cfg.semanticContentThreshold ?? DEFAULT_CONTENT_THRESHOLD);
  const findings = Object.keys(CONTENT_QUESTIONS)
    .filter((label) => answers[label]?.noul >= contentThreshold)
    .map(contentFinding);

  return { dismissed, findings };
}
