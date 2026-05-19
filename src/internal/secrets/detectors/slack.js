const TOKEN_RE = /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g;

export default {
  id: "slack_token",
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
