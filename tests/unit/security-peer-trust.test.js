import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nextResponse: Symbol("next"),
  getSettings: vi.fn(),
  validateApiKey: vi.fn(),
  getConsistentMachineId: vi.fn(),
  verifyDashboardAuthToken: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => mocks.nextResponse),
    json: vi.fn((body, init) => ({ status: init?.status || 200, body })),
    redirect: vi.fn((url) => ({ status: 307, url })),
  },
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  validateApiKey: mocks.validateApiKey,
}));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: mocks.getConsistentMachineId }));
vi.mock("@/lib/auth/dashboardSession", () => ({ verifyDashboardAuthToken: mocks.verifyDashboardAuthToken }));

const { proxy } = await import("../../src/dashboardGuard.js");

const PEER_TOKEN = "peer-token-fixture";
const originalNodeEnv = process.env.NODE_ENV;

function request(pathname, headers = {}) {
  return {
    nextUrl: { pathname, searchParams: new URL(`http://localhost${pathname}`).searchParams },
    headers: new Headers(headers),
    cookies: { get: vi.fn(() => undefined) },
    url: `http://localhost${pathname}`,
  };
}

function trustedRequest(pathname, ip = "127.0.0.1", headers = {}) {
  return request(pathname, {
    "x-llm-gateway-peer-token": PEER_TOKEN,
    "x-llm-gateway-real-ip": ip,
    ...headers,
  });
}

describe("trusted peer request guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
    process.env.LLM_GATEWAY_PEER_TOKEN = PEER_TOKEN;
    mocks.getSettings.mockResolvedValue({ requireLogin: true });
    mocks.validateApiKey.mockResolvedValue(null);
    mocks.getConsistentMachineId.mockResolvedValue("cli-token");
    mocks.verifyDashboardAuthToken.mockResolvedValue(false);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.LLM_GATEWAY_PEER_TOKEN;
  });

  it("rejects Host and real-IP spoofing without the peer proof", async () => {
    const response = await proxy(request("/api/v1/models", {
      host: "localhost",
      "x-llm-gateway-real-ip": "127.0.0.1",
    }));
    expect(response.status).toBe(401);
  });

  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1", "[::1]"])(
    "allows a trusted local peer at %s",
    async (ip) => {
      expect(await proxy(trustedRequest("/api/v1/models", ip))).toBe(mocks.nextResponse);
    },
  );

  it("requires an API key for a trusted non-loopback peer", async () => {
    const response = await proxy(trustedRequest("/api/v1/models", "203.0.113.9"));
    expect(response.status).toBe(401);
  });

  it("accepts a valid remote API key", async () => {
    mocks.validateApiKey.mockResolvedValue({ id: "key-1" });
    const response = await proxy(trustedRequest("/v1/chat/completions", "203.0.113.9", {
      authorization: "Bearer gateway-key",
    }));
    expect(response).toBe(mocks.nextResponse);
    expect(mocks.validateApiKey).toHaveBeenCalledWith("gateway-key");
  });

  it("does not treat a request forwarded through a local proxy as local", async () => {
    const response = await proxy(trustedRequest("/api/v1/models", "127.0.0.1", {
      "x-llm-gateway-via-proxy": "1",
    }));
    expect(response.status).toBe(401);
  });

  it("blocks spoofed access to process-spawning routes", async () => {
    mocks.getSettings.mockResolvedValue({ requireLogin: false });
    const response = await proxy(request("/api/mcp/filesystem/sse", { host: "localhost" }));
    expect(response.status).toBe(403);
  });
});
