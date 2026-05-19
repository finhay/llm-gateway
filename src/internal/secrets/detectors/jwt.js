const JWT_RE = /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}\b/g;

export default {
  id: "jwt",
  kind: "secret",
  severity: "high",
  classification: null,
  scan(text) {
    return [...text.matchAll(JWT_RE)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0],
    }));
  },
};
