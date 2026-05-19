const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const BANK_CONTEXT_RE = /\b(?:bank|account|routing|iban|swift|ach)\b/i;
const ACCOUNT_RE = /(?<!\d)\d{10,16}(?!\d)/g;

export default {
  id: "bank_account",
  kind: "pii",
  severity: "high",
  classification: "customer_pii",
  scan(text) {
    const matches = [...text.matchAll(IBAN_RE)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0],
    }));
    if (!BANK_CONTEXT_RE.test(text)) return matches;
    for (const match of text.matchAll(ACCOUNT_RE)) {
      matches.push({ start: match.index, end: match.index + match[0].length, match: match[0] });
    }
    return matches;
  },
};
