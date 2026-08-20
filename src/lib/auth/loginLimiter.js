import { hasTrustedPeerHeaders } from "./trustedPeer.js";

const MAX_FAILURES = 5;
const LOCK_STEPS_MS = [30_000, 120_000, 600_000, 1_800_000];
const FAILURE_WINDOW_MS = 60 * 60 * 1000;
const attempts = new Map();

function getEntry(ip, currentTime = Date.now()) {
  const entry = attempts.get(ip);
  if (!entry) return null;
  if (entry.lastFailureAt && currentTime - entry.lastFailureAt > FAILURE_WINDOW_MS && currentTime >= entry.lockUntil) {
    attempts.delete(ip);
    return null;
  }
  return entry;
}

export function checkLock(ip, currentTime = Date.now()) {
  const entry = getEntry(ip, currentTime);
  if (!entry || currentTime >= entry.lockUntil) return { locked: false };
  return { locked: true, retryAfter: Math.ceil((entry.lockUntil - currentTime) / 1000) };
}

export function recordFailure(ip, currentTime = Date.now()) {
  const entry = getEntry(ip, currentTime) || {
    failures: 0,
    lockUntil: 0,
    lockLevel: 0,
    lastFailureAt: 0,
  };
  entry.failures += 1;
  entry.lastFailureAt = currentTime;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockUntil = currentTime + LOCK_STEPS_MS[Math.min(entry.lockLevel, LOCK_STEPS_MS.length - 1)];
    entry.lockLevel += 1;
    entry.failures = 0;
  }
  attempts.set(ip, entry);
  return { remainingBeforeLock: Math.max(0, MAX_FAILURES - entry.failures) };
}

export function recordSuccess(ip) {
  attempts.delete(ip);
}

export function getClientIp(request) {
  if (hasTrustedPeerHeaders(request)) {
    const realIp = request.headers.get("x-llm-gateway-real-ip");
    if (realIp) return realIp;
  }
  if (process.env.TRUST_PROXY === "true") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0].trim();
  }
  // One shared bucket is safer than accepting spoofable client IP headers.
  return "unknown";
}

export const __test__ = {
  reset() {
    attempts.clear();
  },
};
