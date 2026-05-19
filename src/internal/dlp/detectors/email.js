const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export default {
  id: "email",
  kind: "pii",
  severity: "normal",
  classification: "internal",
  scan(text) {
    return [...text.matchAll(EMAIL_RE)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0],
    }));
  },
};
