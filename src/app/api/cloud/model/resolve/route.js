import { NextResponse } from "next/server";
import { getModelAliases } from "@/models";
import { getSettings } from "@/lib/localDb";
import { authenticateApiKey, API_KEY_SCOPES } from "@/sse/services/auth.js";

// Resolve model alias to provider/model
export async function POST(request) {
  try {
    const settings = await getSettings();
    const auth = await authenticateApiKey(request, { settings: { ...settings, requireApiKey: true }, requiredScope: API_KEY_SCOPES.CLOUD_SYNC });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await request.json();
    const { alias } = body;

    if (!alias) {
      return NextResponse.json({ error: "Missing alias" }, { status: 400 });
    }

    // Get model aliases
    const modelAliases = await getModelAliases();
    const resolved = modelAliases[alias];

    if (resolved) {
      // Parse provider/model
      const firstSlash = resolved.indexOf("/");
      if (firstSlash > 0) {
        return NextResponse.json({
          alias,
          provider: resolved.slice(0, firstSlash),
          model: resolved.slice(firstSlash + 1)
        });
      }
    }

    // Not found
    return NextResponse.json({ error: "Alias not found" }, { status: 404 });

  } catch (error) {
    console.log("Model resolve error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
