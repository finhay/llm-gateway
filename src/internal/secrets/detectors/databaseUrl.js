const DB_URL_RE = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s'"<>]+/gi;
const PROD_RE = /(?:prod|production|rds\.amazonaws\.com|database\.windows\.net|cloudsql|mongodb\.net)/i;

export default {
  id: "database_url",
  kind: "secret",
  severity: "critical",
  classification: null,
  scan(text) {
    return [...text.matchAll(DB_URL_RE)]
      .filter((match) => /:\/\/[^:@/]+:[^@/]+@/.test(match[0]) || PROD_RE.test(match[0]))
      .map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        match: match[0],
      }));
  },
};
