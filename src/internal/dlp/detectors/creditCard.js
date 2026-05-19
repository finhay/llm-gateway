const CARD_RE = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;

function luhn(value) {
  const digits = value.replace(/\D/g, "");
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

export default {
  id: "credit_card",
  kind: "pii",
  severity: "high",
  classification: "customer_pii",
  scan(text) {
    return [...text.matchAll(CARD_RE)]
      .filter((match) => luhn(match[0]))
      .map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        match: match[0],
      }));
  },
};
