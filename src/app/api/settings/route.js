import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import bcrypt from "bcryptjs";
import { getSmartRoutingConfig, validateSmartRoutingConfig } from "@/lib/smartRouting/defaults.js";
import { resetCandidateCache } from "@/sse/services/candidateDiscovery.js";
import { DECISION_PROVIDERS, getDecisionProvider, getDecisionKeyStatus } from "@/lib/smartRouting/providers.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, oidcClientSecret, decisionApiKeys, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    safeSettings.decisionKeyStatus = getDecisionKeyStatus(settings);
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...safeSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password
    }, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First time setting password, no current password needed
        // Allow empty currentPassword or default "123456"
        if (body.currentPassword && body.currentPassword !== "123456") {
           return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    if (Object.prototype.hasOwnProperty.call(body, "oidcClientSecret")) {
      if (!body.oidcClientSecret || !String(body.oidcClientSecret).trim()) {
        delete body.oidcClientSecret;
      }
    }

    const hasSmartRouting = body.smartRouting && typeof body.smartRouting === "object";
    const hasDecisionKeys = body.decisionApiKeys && typeof body.decisionApiKeys === "object";
    if (hasSmartRouting || hasDecisionKeys) {
      const current = await getSettings();

      // Settings are merged shallowly: complete the partial object so omitted fields keep their value
      if (hasSmartRouting) {
        const next = { ...getSmartRoutingConfig(current), ...body.smartRouting };
        if (!getDecisionProvider(next.provider)) {
          return NextResponse.json(
            { error: `Unknown decision provider "${next.provider}". Available: ${Object.keys(DECISION_PROVIDERS).join(", ")}` },
            { status: 400 }
          );
        }
        const problem = validateSmartRoutingConfig(next);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
        body.smartRouting = next;
        resetCandidateCache();
      }

      // Keys are write-only and stored per provider. A string sets one, null removes it,
      // anything else (including an empty string) leaves the stored key untouched.
      if (hasDecisionKeys) {
        const keys = { ...(current.decisionApiKeys || {}) };
        for (const [id, value] of Object.entries(body.decisionApiKeys)) {
          if (!getDecisionProvider(id)) {
            return NextResponse.json({ error: `Unknown decision provider "${id}"` }, { status: 400 });
          }
          if (value === null) delete keys[id];
          else if (typeof value === "string" && value.trim()) keys[id] = value.trim();
        }
        body.decisionApiKeys = keys;
      }
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    const { password, oidcClientSecret, decisionApiKeys, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    safeSettings.decisionKeyStatus = getDecisionKeyStatus(settings);
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
