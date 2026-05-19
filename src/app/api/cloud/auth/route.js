import { NextResponse } from "next/server";
import { getProviderConnections, getModelAliases } from "@/models";
import { getSettings } from "@/lib/localDb";
import { authenticateApiKey, API_KEY_SCOPES } from "@/sse/services/auth.js";

// Verify API key and return provider credentials
export async function POST(request) {
  try {
    const settings = await getSettings();
    const auth = await authenticateApiKey(request, { settings: { ...settings, requireApiKey: true }, requiredScope: API_KEY_SCOPES.CLOUD_SYNC });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    // Get active provider connections
    const connections = await getProviderConnections({ isActive: true });

    // Map connections
    const mappedConnections = connections.map(conn => ({
      provider: conn.provider,
      authType: conn.authType,
      apiKey: conn.apiKey || null,
      accessToken: conn.accessToken || null,
      refreshToken: conn.refreshToken || null,
      projectId: conn.projectId || null,
      expiresAt: conn.expiresAt,
      priority: conn.priority,
      globalPriority: conn.globalPriority,
      defaultModel: conn.defaultModel,
      isActive: conn.isActive
    }));

    // Get model aliases
    const modelAliases = await getModelAliases();

    return NextResponse.json({
      connections: mappedConnections,
      modelAliases
    });

  } catch (error) {
    console.log("Cloud auth error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
