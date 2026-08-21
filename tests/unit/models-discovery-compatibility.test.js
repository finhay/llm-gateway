import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(),
  getCustomModels: vi.fn(),
  getModelAliases: vi.fn(),
  getSettings: vi.fn(),
  getDisabledModels: vi.fn(),
  authenticateApiKey: vi.fn(),
}));

vi.mock("../../src/lib/localDb.js", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getCombos: mocks.getCombos,
  getCustomModels: mocks.getCustomModels,
  getModelAliases: mocks.getModelAliases,
  getSettings: mocks.getSettings,
}));

vi.mock("../../src/lib/disabledModelsDb.js", () => ({
  getDisabledModels: mocks.getDisabledModels,
}));

vi.mock("../../src/sse/services/auth.js", () => ({
  API_KEY_SCOPES: { MODELS_READ: "models:read" },
  authenticateApiKey: mocks.authenticateApiKey,
}));

import { GET, buildModelsList } from "../../src/app/api/v1/models/route.js";

describe("Claude-compatible model discovery", () => {
  beforeEach(() => {
    mocks.getProviderConnections.mockResolvedValue([
      { provider: "minimax", isActive: true, providerSpecificData: {} },
    ]);
    mocks.getCombos.mockResolvedValue([]);
    mocks.getCustomModels.mockResolvedValue([]);
    mocks.getModelAliases.mockResolvedValue({
      "claude-sonnet-m3": "minimax/MiniMax-M3",
    });
    mocks.getSettings.mockResolvedValue({});
    mocks.getDisabledModels.mockResolvedValue({});
    mocks.authenticateApiKey.mockResolvedValue({ ok: true });
  });

  it("lists the client-facing alias as a model ID", async () => {
    const models = await buildModelsList(["llm"]);

    expect(models).toContainEqual(expect.objectContaining({
      id: "claude-sonnet-m3",
      object: "model",
    }));
  });

  it("returns fields understood by both Anthropic and OpenAI discovery clients", async () => {
    const response = await GET(new Request("http://localhost:20128/v1/models", {
      headers: { "x-api-key": "test-key", "anthropic-version": "2023-06-01" },
    }));
    const payload = await response.json();
    const alias = payload.data.find((model) => model.id === "claude-sonnet-m3");

    expect(response.status).toBe(200);
    expect(alias).toMatchObject({
      id: "claude-sonnet-m3",
      object: "model",
      type: "model",
      display_name: "claude-sonnet-m3",
      created_at: "1970-01-01T00:00:00Z",
    });
    expect(payload).toMatchObject({ object: "list", has_more: false });
    expect(payload.first_id).toBe(payload.data[0].id);
    expect(payload.last_id).toBe(payload.data.at(-1).id);
  });
});
