const PEM_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export default {
  id: "pem_private_key",
  kind: "secret",
  severity: "critical",
  classification: null,
  scan(text) {
    return [...text.matchAll(PEM_RE)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0],
    }));
  },
};
