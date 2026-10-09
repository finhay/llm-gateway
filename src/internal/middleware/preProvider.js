import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import { walkTextNodes, isConversationPath } from "@/internal/walker/walkTextNodes.js";
import { scanNodes as scanSecretNodes } from "@/internal/secrets/scanner.js";
import { scanNodes as scanDlpNodes } from "@/internal/dlp/scanner.js";
import { classifyDlp } from "@/internal/dlp/classifier.js";
import { applyRedactions } from "@/internal/secrets/redactor.js";
import { recordSecurityEvents } from "@/internal/audit/index.js";
import { isProviderAllowed, restrictsProviders } from "@/internal/policy/providerRisk.js";
import { runSemanticChecks } from "@/internal/dlp/semantic.js";

function scanSettings(settings = {}) {
  return settings.securityScan || {};
}

function eventFor(match, context, action, ruleId) {
  return {
    requestId: context.requestId,
    apiKey: context.apiKey,
    model: context.model,
    provider: context.provider,
    kind: match.kind,
    type: match.type,
    severity: match.severity,
    classification: match.classification,
    location: match.location,
    fingerprint: match.fingerprint,
    action,
    ruleId: match.ruleId || ruleId,
  };
}

function auditMatches(matches, context, action, ruleId) {
  if (!matches.length) return Promise.resolve(0);
  return recordSecurityEvents(matches.map((match) => eventFor(match, context, action, ruleId)));
}

function modeEnabled(mode) {
  return mode !== "dryrun";
}

function globalActionFor(match, secretsMode, dlpMode) {
  const mode = match.kind === "secret" ? secretsMode : dlpMode;
  if (!modeEnabled(mode)) return "logged";
  if (match.kind === "secret" && match.severity === "critical") return "blocked";
  return "redacted";
}

function actionFor(match, detectorOverrides, secretsMode, dlpMode) {
  if (match.action) return match.action;
  const override = detectorOverrides?.[match.type]?.action;
  if (override && override !== "default") return override;
  return globalActionFor(match, secretsMode, dlpMode);
}

function matchesByAction(matches, detectorOverrides, secretsMode, dlpMode) {
  return matches.reduce((groups, match) => {
    const action = actionFor(match, detectorOverrides, secretsMode, dlpMode);
    groups[action] = groups[action] || [];
    groups[action].push(match);
    return groups;
  }, {});
}

// Provider-risk routing should be driven by conversation payloads, not by
// client-generated system instructions or tool schemas. Rich clients such as
// Claude Desktop embed version numbers, example identifiers, and opaque tokens
// in those structural fields, which can resemble PII and must not make every
// configured provider appear unavailable.
function isConversationPayload(match) {
  return isConversationPath(match?.location || "");
}

async function auditGroups(actionGroups, context) {
  await Promise.all(Object.entries(actionGroups).map(([action, matches]) => (
    auditMatches(matches, context, action, `${action}-${matches[0]?.kind || "security"}`)
  )));
}

async function denyIfBlocked(matches, context, groupsFor) {
  const actionGroups = groupsFor(matches);
  const blockedMatch = actionGroups.blocked?.[0];
  if (!blockedMatch) return { actionGroups };
  await auditGroups(actionGroups, context);
  return {
    deny: errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `Security detector "${blockedMatch.type}" matched; request blocked.`
    ),
  };
}

export async function preProvider({ body, modelStr, apiKey, settings, request }) {
  const cfg = scanSettings(settings);
  const format = request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null;
  const nodes = walkTextNodes(body, format);
  const context = { apiKey, model: modelStr, provider: null };

  const secretsEnabled = cfg.secretsEnabled !== false;
  const dlpEnabled = cfg.dlpEnabled !== false;
  const secretsMode = cfg.secretsMode || "enforce";
  const dlpMode = cfg.dlpMode || "enforce";

  const detectorOverrides = cfg.detectorOverrides || {};
  const secretMatches = secretsEnabled ? scanSecretNodes(nodes, detectorOverrides) : [];
  const dlpMatches = dlpEnabled ? scanDlpNodes(nodes, cfg.customDlpPatterns || [], detectorOverrides) : [];
  const allMatches = [...secretMatches, ...dlpMatches];
  const groupsFor = (matches) => matchesByAction(matches, detectorOverrides, secretsMode, dlpMode);

  // A blocked secret denies the request outright; no semantic check can change that.
  if (secretMatches.some((match) => actionFor(match, detectorOverrides, secretsMode, dlpMode) === "blocked")) {
    return { deny: (await denyIfBlocked(allMatches, context, groupsFor)).deny };
  }

  // Opt-in TypeSafe checks: PII hits judged clearly not PII in context stop restricting
  // routing but keep their normal action, so request text that sways the model can never
  // un-redact a value or override a detector's block setting. Content classifications
  // arrive as extra match-shaped findings.
  const semantic = await runSemanticChecks({ cfg, matches: allMatches, nodes });
  const matches = [
    ...allMatches.map((match) => (semantic.dismissed.has(match)
      ? { ...match, classification: null, ruleId: "semantic-dismissed-pii" }
      : match)),
    ...semantic.findings,
  ];

  const { deny, actionGroups } = await denyIfBlocked(matches, context, groupsFor);
  if (deny) return { deny };

  const classification = classifyDlp([...matches.filter(isConversationPayload), ...semantic.findings]);

  applyRedactions(nodes, actionGroups.redacted || []);
  await auditGroups(actionGroups, context);

  const providerFilter = restrictsProviders(classification)
    ? (connection) => isProviderAllowed(connection.provider, classification, cfg.providerRiskOverrides || {})
    : null;

  return {
    allow: true,
    providerFilter,
    classification,
    matches,
  };
}

export default preProvider;
