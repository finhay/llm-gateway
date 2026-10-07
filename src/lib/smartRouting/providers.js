import { classify as typesafeClassify } from "./typesafeClient.js";

/**
 * Decision providers: services that classify a prompt into { tag, complexity }.
 * An API key only means something together with its provider, so keys are stored per
 * provider id (settings.decisionApiKeys[id]) and the active provider is smartRouting.provider.
 *
 * To add a provider, register it here. `classify` must resolve to
 * { tag, confidence, complexity, complexityConfidence } and throw on any failure.
 */
export const DECISION_PROVIDERS = {
  typesafe: {
    id: "typesafe",
    label: "TypeSafe System One",
    envKey: "TYPESAFE_API_KEY",
    envBaseUrlKey: "TYPESAFE_BASE_URL",
    defaultModel: "jev-latest",
    classify: typesafeClassify,
  },
};

export const DEFAULT_DECISION_PROVIDER = "typesafe";

export function getDecisionProvider(id) {
  return Object.prototype.hasOwnProperty.call(DECISION_PROVIDERS, id) ? DECISION_PROVIDERS[id] : null;
}

/** Environment wins over the admin-stored key, so a deployment can pin its secret. */
export function resolveDecisionApiKey({ settings, provider, env = process.env }) {
  const fromEnv = env[provider.envKey];
  if (fromEnv) return { key: fromEnv, source: "env" };
  const stored = settings?.decisionApiKeys?.[provider.id];
  if (stored) return { key: stored, source: "settings" };
  return { key: "", source: null };
}

/** Which providers have a key and where it comes from. Never includes the key itself. */
export function getDecisionKeyStatus(settings, env = process.env) {
  return Object.fromEntries(
    Object.values(DECISION_PROVIDERS).map((provider) => {
      const { source } = resolveDecisionApiKey({ settings, provider, env });
      return [provider.id, { label: provider.label, envKey: provider.envKey, configured: !!source, source }];
    }),
  );
}
