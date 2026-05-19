const RANK = {
  internal: 1,
  customer_pii: 2,
};

export function classifyDlp(matches = []) {
  let selected = null;
  for (const match of matches) {
    const classification = match.classification;
    if (!classification) continue;
    if (!selected || (RANK[classification] || 0) > (RANK[selected] || 0)) {
      selected = classification;
    }
  }
  return selected;
}
