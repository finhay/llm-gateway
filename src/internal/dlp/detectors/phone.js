const PHONE_RE = /(?<![A-Za-z0-9_])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?84[-.\s]?(?:\d[-.\s]?){8,10})(?![A-Za-z0-9_])/g;

function hasPhoneShape(value) {
  return value.startsWith("+") || /[-.\s()]/.test(value);
}

export default {
  id: "phone_number",
  kind: "pii",
  severity: "normal",
  classification: "internal",
  scan(text) {
    return [...text.matchAll(PHONE_RE)]
      .filter((match) => hasPhoneShape(match[0]))
      .map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        match: match[0],
      }));
  },
};
