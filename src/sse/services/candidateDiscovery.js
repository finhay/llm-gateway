import { getProviderConnections, getModelAliases, getCustomModels, getPricingForModel } from "@/lib/localDb";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { FREE_PROVIDERS, AI_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { buildCandidatePool } from "@/lib/smartRouting/modelProfile.js";

const CACHE_TTL_MS = 30_000;
let cache = { expiresAt: 0, models: null };

const isLlm = (m) => !m.type || m.type === "llm";

/**
 * Every LLM model reachable through the providers that are connected right now:
 * built-in models, custom models and aliases of pass-through providers, minus models the
 * admin disabled. Compatible (custom endpoint) providers are not discovered in Phase 1.
 */
async function loadReachableModels() {
  if (cache.models && cache.expiresAt > Date.now()) return cache.models;

  const [connections, aliases, customModels, disabled] = await Promise.all([
    getProviderConnections({ isActive: true }),
    getModelAliases(),
    getCustomModels(),
    getDisabledModels(),
  ]);

  const providerIds = new Set(connections.map((c) => c.provider));
  for (const [id, p] of Object.entries(FREE_PROVIDERS)) if (p.noAuth) providerIds.add(id);

  const found = new Map(); // "alias/model" -> { id, provider, name }
  for (const provider of providerIds) {
    if (isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider)) continue;
    const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
    const off = new Set([...(disabled[alias] || []), ...(disabled[provider] || [])]);
    const add = (modelId, name) => {
      if (!modelId || off.has(modelId)) return;
      const id = `${alias}/${modelId}`;
      if (!found.has(id)) found.set(id, { id, provider, name: name || modelId });
    };

    for (const m of getModelsByProviderId(provider)) if (isLlm(m)) add(m.id, m.name);
    for (const m of customModels) if (m.providerAlias === alias && isLlm(m)) add(m.id, m.name);
    if (AI_PROVIDERS[provider]?.passthroughModels) {
      for (const [aliasName, full] of Object.entries(aliases)) {
        if (full.startsWith(`${alias}/`)) add(full.slice(alias.length + 1), aliasName);
      }
    }
  }

  const models = await Promise.all(
    [...found.values()].map(async (m) => ({ ...m, pricing: await getPricingForModel(m.provider, m.id.slice(m.id.indexOf("/") + 1)).catch(() => null) }))
  );
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, models };
  return models;
}

/** The router's candidate pool for the current moment, shaped by the profile's include/exclude/overrides. */
export async function discoverCandidates(cfg) {
  return buildCandidatePool(await loadReachableModels(), cfg);
}

export function resetCandidateCache() {
  cache = { expiresAt: 0, models: null };
}
