const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const VN_CCCD_RE = /(?<!\d)\d{12}(?!\d)/g;

function validSsn(value) {
  const [area, group, serial] = value.split("-");
  return area !== "000" && area !== "666" && Number(area) < 900 && group !== "00" && serial !== "0000";
}

export default {
  id: "national_id",
  kind: "pii",
  severity: "high",
  classification: "customer_pii",
  scan(text) {
    const matches = [];
    for (const match of text.matchAll(SSN_RE)) {
      if (!validSsn(match[0])) continue;
      matches.push({ start: match.index, end: match.index + match[0].length, match: match[0] });
    }
    for (const match of text.matchAll(VN_CCCD_RE)) {
      matches.push({ start: match.index, end: match.index + match[0].length, match: match[0] });
    }
    return matches;
  },
};
