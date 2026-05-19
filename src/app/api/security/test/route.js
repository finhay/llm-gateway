import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { scanText as scanSecrets } from "@/internal/secrets/scanner.js";
import { scanText as scanDlp } from "@/internal/dlp/scanner.js";
import { classifyDlp } from "@/internal/dlp/classifier.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeMatch(match) {
  const { node, rawValue, start, end, ...safe } = match;
  return safe;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text : "";
    const settings = await getSettings();
    const detectorOverrides = settings.securityScan?.detectorOverrides || {};
    const secrets = scanSecrets(text, "tester.text", detectorOverrides);
    const pii = scanDlp(text, "tester.text", settings.securityScan?.customDlpPatterns || [], detectorOverrides);
    return NextResponse.json({
      secrets: secrets.map(safeMatch),
      pii: pii.map(safeMatch),
      classification: classifyDlp(pii),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
