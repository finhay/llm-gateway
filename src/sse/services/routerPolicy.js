import { getProviderConnections } from "@/lib/localDb";
import { isModelLockActive } from "open-sse/services/accountFallback.js";
import { FREE_PROVIDERS } from "@/shared/constants/providers";
import { isProviderAllowed } from "./auth.js";

/**
 * Builds the per-request check that decides whether a candidate may be offered to the router.
 * It applies the same rules the request would face when executed, so the decision model never
 * sees a model the gateway would refuse or could not reach:
 *  - API key provider allowlist (only when the key is enforced)
 *  - provider-risk / DLP filter from preProvider
 *  - provider has an active connection that is not locked for this model
 *
 * @returns {(candidate: { id: string, provider: string }) => Promise<string|null>}
 *          reason ("key-policy" | "dlp-policy" | "unavailable") or null when allowed
 */
export function buildPolicyCheck({ keyRecord, keyEnforced, providerFilter }) {
  const connectionsByProvider = new Map();
  const connectionsOf = async (provider) => {
    if (!connectionsByProvider.has(provider)) {
      connectionsByProvider.set(provider, getProviderConnections({ provider, isActive: true }));
    }
    return connectionsByProvider.get(provider);
  };

  return async (candidate) => {
    const { provider } = candidate;
    if (keyEnforced && !isProviderAllowed(keyRecord, provider)) return "key-policy";

    const model = candidate.id.slice(candidate.id.indexOf("/") + 1);
    const connections = FREE_PROVIDERS[provider]?.noAuth
      ? [{ id: "noauth", provider }]
      : (await connectionsOf(provider)).filter((c) => !isModelLockActive(c, model));
    if (connections.length === 0) return "unavailable";
    if (providerFilter && !connections.some((c) => providerFilter(c))) return "dlp-policy";
    return null;
  };
}
