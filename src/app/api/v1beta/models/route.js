import { getSettings } from "@/lib/localDb";
import { authenticateApiKey, API_KEY_SCOPES } from "@/sse/services/auth.js";
import { PROVIDER_MODELS } from "@/shared/constants/models";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

/**
 * GET /v1beta/models - Gemini compatible models list
 * Returns models in Gemini API format
 */
export async function GET(request) {
  try {
    const settings = await getSettings();
    const auth = await authenticateApiKey(request, { settings, requiredScope: API_KEY_SCOPES.MODELS_READ });
    if (!auth.ok) return Response.json({ error: { message: auth.message } }, { status: auth.status });

    // Collect all models from all providers
    const models = [];
    
    for (const [provider, providerModels] of Object.entries(PROVIDER_MODELS)) {
      for (const model of providerModels) {
        models.push({
          name: `models/${provider}/${model.id}`,
          displayName: model.name || model.id,
          description: `${provider} model: ${model.name || model.id}`,
          supportedGenerationMethods: ["generateContent"],
          inputTokenLimit: 128000,
          outputTokenLimit: 8192,
        });
      }
    }

    return Response.json({ models });
  } catch (error) {
    console.log("Error fetching models:", error);
    return Response.json({ error: { message: error.message } }, { status: 500 });
  }
}

