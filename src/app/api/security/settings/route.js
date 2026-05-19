import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";

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
]);

function normalizeSecurityScan(value = {}) {
  const next = {};
  for (const [key, val] of Object.entries(value || {})) {
    if (ALLOWED_KEYS.has(key)) next[key] = val;
  }
  return next;
}

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ securityScan: settings.securityScan || {} });
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
    return NextResponse.json({ securityScan: settings.securityScan || {} });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
