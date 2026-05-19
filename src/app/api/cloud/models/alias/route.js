import { NextResponse } from "next/server";
import { getModelAliases, setModelAlias } from "@/models";
import { getSettings } from "@/lib/localDb";
import { authenticateApiKey, API_KEY_SCOPES } from "@/sse/services/auth.js";

// PUT /api/cloud/models/alias - Set model alias (for cloud/CLI)
export async function PUT(request) {
  try {
    const settings = await getSettings();
    const auth = await authenticateApiKey(request, { settings: { ...settings, requireApiKey: true }, requiredScope: API_KEY_SCOPES.CLOUD_SYNC });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await request.json();
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    // Check if alias already exists for different model
    const aliases = await getModelAliases();
    const existingModel = aliases[alias];
    if (existingModel && existingModel !== model) {
      return NextResponse.json({ 
        error: `Alias '${alias}' already in use for model '${existingModel}'` 
      }, { status: 400 });
    }

    // Update alias
    await setModelAlias(alias, model);

    return NextResponse.json({ 
      success: true, 
      model, 
      alias,
      message: `Alias '${alias}' set for model '${model}'`
    });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}

// GET /api/cloud/models/alias - Get all aliases
export async function GET(request) {
  try {
    const settings = await getSettings();
    const auth = await authenticateApiKey(request, { settings: { ...settings, requireApiKey: true }, requiredScope: API_KEY_SCOPES.CLOUD_SYNC });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const aliases = await getModelAliases();

    return NextResponse.json({ aliases });
  } catch (error) {
    console.log("Error fetching aliases:", error);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}
