const TOKEN_RE = /\b[A-Za-z0-9_+\/-]{32,}\b/g;

function shannonEntropy(value) {
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export default {
  id: "high_entropy_token",
  kind: "secret",
  severity: "normal",
  classification: null,
  scan(text) {
    return [...text.matchAll(TOKEN_RE)]
      .filter((match) => shannonEntropy(match[0]) >= 4.5)
      .map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        match: match[0],
      }));
  },
};
