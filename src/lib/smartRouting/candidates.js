// Which candidate models may be offered to the decision model for a request.

/**
 * Reason a candidate cannot serve this request, or null when it can.
 * Hard requirements are checked before the (async, I/O backed) policy check.
 */
function requirementReason(candidate, signals) {
  const caps = candidate.capabilities || {};
  if (signals.needsVision && !caps.vision) return "no-vision";
  if (signals.needsTools && !caps.tools) return "no-tools";
  if (signals.needsStructuredOutput && !caps.structuredOutput) return "no-structured-output";
  if (candidate.contextLimit && signals.estimatedTokens > candidate.contextLimit) return "context-too-small";
  return null;
}

/**
 * Keep only candidates that satisfy the request's capabilities and size AND pass policy.
 * Nothing rejected here is ever sent to the decision model or accepted from it.
 *
 * @param {object[]} candidates profile candidates
 * @param {object} signals from extractSignals()
 * @param {(candidate: object) => Promise<string|null>} checkPolicy reason it is not allowed/available, or null
 * @returns {Promise<{ eligible: object[], rejected: { id: string, reason: string }[] }>}
 */
export async function filterCandidates(candidates, signals, checkPolicy) {
  const eligible = [];
  const rejected = [];
  for (const candidate of candidates) {
    const reason = requirementReason(candidate, signals) || (await checkPolicy(candidate));
    if (reason) rejected.push({ id: candidate.id, reason });
    else eligible.push(candidate);
  }
  return { eligible, rejected };
}
