const RANK = {
  internal: 1,
  source_code_private: 2,
  customer_pii: 3,
  credentials: 4,
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
