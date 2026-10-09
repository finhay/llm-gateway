import { NextResponse } from "next/server";
import { getSettings, updateSettings, toPublicSettings } from "@/lib/localDb";
import { resolveTypesafeApiKey } from "@/internal/dlp/semantic.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_KEYS = new Set([
  "secretsEnabled",
  "secretsMode",
  "dlpEnabled",
  "dlpMode",
  "customDlpPatterns",
  "providerRiskOverrides",
  "detectorOverrides",
  "semanticPiiVerification",
  "semanticContentClassification",
  "semanticPiiDismissBelow",
  "semanticContentThreshold",
]);

function normalizeSecurityScan(value = {}) {
  const next = {};
  for (const [key, val] of Object.entries(value || {})) {
    if (ALLOWED_KEYS.has(key)) next[key] = val;
  }
  // Write-only: a non-empty string sets the key, null clears it, anything else keeps it.
  if (typeof value?.typesafeApiKey === "string" && value.typesafeApiKey.trim()) {
    next.typesafeApiKey = value.typesafeApiKey.trim();
  } else if (value?.typesafeApiKey === null) {
    next.typesafeApiKey = "";
  }
  return next;
}

function publicSecurityScan(settings) {
  return {
    ...toPublicSettings(settings).securityScan,
    typesafeApiKeyFromEnv: Boolean(resolveTypesafeApiKey()),
  };
}

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ securityScan: publicSecurityScan(settings) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const current = await getSettings();
    const securityScan = {
      ...(current.securityScan || {}),
      ...normalizeSecurityScan(body.securityScan || body),
    };
    const settings = await updateSettings({ securityScan });
    return NextResponse.json({ securityScan: publicSecurityScan(settings) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
