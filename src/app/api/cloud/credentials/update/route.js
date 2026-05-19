import { NextResponse } from "next/server";
import { getProviderConnections, updateProviderConnection } from "@/models";
import { getSettings } from "@/lib/localDb";
import { authenticateApiKey, API_KEY_SCOPES } from "@/sse/services/auth.js";

// Update provider credentials (for cloud token refresh)
export async function PUT(request) {
  try {
    const settings = await getSettings();
    const auth = await authenticateApiKey(request, { settings: { ...settings, requireApiKey: true }, requiredScope: API_KEY_SCOPES.CLOUD_SYNC });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await request.json();
    const { provider, credentials } = body;

    if (!provider || !credentials) {
      return NextResponse.json({ error: "Provider and credentials required" }, { status: 400 });
    }

    // Find active connection for provider
    const connections = await getProviderConnections({ provider, isActive: true });
    const connection = connections[0];

    if (!connection) {
      return NextResponse.json({ error: `No active connection found for provider: ${provider}` }, { status: 404 });
    }

    // Update credentials
    const updateData = {};
    if (credentials.accessToken) {
      updateData.accessToken = credentials.accessToken;
    }
    if (credentials.refreshToken) {
      updateData.refreshToken = credentials.refreshToken;
    }
    if (credentials.expiresIn) {
      updateData.expiresAt = new Date(Date.now() + credentials.expiresIn * 1000).toISOString();
    }

    await updateProviderConnection(connection.id, updateData);

    return NextResponse.json({ 
      success: true, 
      message: `Credentials updated for provider: ${provider}` 
    });

  } catch (error) {
    console.log("Update credentials error:", error);
    return NextResponse.json({ error: "Failed to update credentials" }, { status: 500 });
  }
}
