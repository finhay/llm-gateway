const ACCESS_KEY_RE = /\b(?:AKIA|ASIA|AGPA|AIDA)[A-Z0-9]{16}\b/g;
const SECRET_KEY_RE = /\b[A-Za-z0-9/+=]{40}\b/g;

function scan(text) {
  const matches = [];
  for (const match of text.matchAll(ACCESS_KEY_RE)) {
    matches.push({ start: match.index, end: match.index + match[0].length, match: match[0] });
  }
  for (const match of text.matchAll(SECRET_KEY_RE)) {
    if (!/[A-Z]/.test(match[0]) || !/[a-z]/.test(match[0]) || !/[0-9]/.test(match[0])) continue;
    matches.push({ start: match.index, end: match.index + match[0].length, match: match[0] });
  }
  return matches;
}

export default {
  id: "aws_secret",
  kind: "secret",
  severity: "high",
  classification: null,
  scan,
};
