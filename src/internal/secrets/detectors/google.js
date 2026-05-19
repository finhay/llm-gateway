const TOKEN_RE = /\bAIza[A-Za-z0-9_-]{20,}\b/g;

export default {
  id: "google_api_key",
  kind: "secret",
  severity: "high",
  classification: null,
  scan(text) {
    return [...text.matchAll(TOKEN_RE)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0],
    }));
  },
};
