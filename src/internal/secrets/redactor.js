function replacementFor(match) {
  return `[REDACTED_${String(match.type || "SECRET").toUpperCase()}]`;
}

export function redactText(text, matches) {
  if (!matches?.length) return text;
  let next = text;
  for (const match of [...matches].sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, match.start)}${replacementFor(match)}${next.slice(match.end)}`;
  }
  return next;
}

export function applyRedactions(nodes, matches) {
  if (!matches?.length) return 0;
  let changed = 0;
  for (const node of nodes) {
    const nodeMatches = matches.filter((match) => match.node === node);
    if (!nodeMatches.length) continue;
    node.set(redactText(node.value, nodeMatches));
    changed++;
  }
  return changed;
}
