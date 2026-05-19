export function buildCustomDetectors(patterns = []) {
  if (!Array.isArray(patterns)) return [];
  return patterns.flatMap((pattern) => {
    if (!pattern?.id || !pattern?.regex) return [];
    try {
      const flags = pattern.flags?.includes("g") ? pattern.flags : `${pattern.flags || ""}g`;
      const regex = new RegExp(pattern.regex, flags);
      return [{
        id: pattern.id,
        kind: "pii",
        severity: pattern.severity || "normal",
        classification: pattern.classification || "internal",
        scan(text) {
          regex.lastIndex = 0;
          return [...text.matchAll(regex)].map((match) => ({
            start: match.index,
            end: match.index + match[0].length,
            match: match[0],
          }));
        },
      }];
    } catch {
      return [];
    }
  });
}
