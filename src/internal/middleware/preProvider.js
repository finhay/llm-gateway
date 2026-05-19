import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import { walkTextNodes } from "@/internal/walker/walkTextNodes.js";
import { scanNodes as scanSecretNodes } from "@/internal/secrets/scanner.js";
import { scanNodes as scanDlpNodes } from "@/internal/dlp/scanner.js";
import { classifyDlp } from "@/internal/dlp/classifier.js";
import { applyRedactions } from "@/internal/secrets/redactor.js";
import { recordSecurityEvents } from "@/internal/audit/index.js";
import { isProviderAllowed } from "@/internal/policy/providerRisk.js";

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
    ruleId,
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
  const actionGroups = matchesByAction(allMatches, detectorOverrides, secretsMode, dlpMode);
  const blockedMatch = actionGroups.blocked?.[0];
  if (blockedMatch) {
    await Promise.all(Object.entries(actionGroups).map(([action, matches]) => (
      auditMatches(matches, context, action, `${action}-${matches[0]?.kind || "security"}`)
    )));
    return {
      deny: errorResponse(
        HTTP_STATUS.BAD_REQUEST,
        `Security detector "${blockedMatch.type}" matched; request blocked.`
      ),
    };
  }

  const classification = classifyDlp(dlpMatches);

  applyRedactions(nodes, actionGroups.redacted || []);

  await Promise.all(Object.entries(actionGroups).map(([action, matches]) => (
    auditMatches(matches, context, action, `${action}-${matches[0]?.kind || "security"}`)
  )));

  const providerFilter = classification === "customer_pii"
    ? (connection) => isProviderAllowed(connection.provider, classification, cfg.providerRiskOverrides || {})
    : null;

  return {
    allow: true,
    providerFilter,
    classification,
    matches: allMatches,
  };
}

export default preProvider;
