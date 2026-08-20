import { beforeEach, describe, expect, it, vi } from "vitest";
import { __test__, checkLock, getClientIp, recordFailure } from "../../src/lib/auth/loginLimiter.js";

function request(headers = {}) {
  return { headers: new Headers(headers) };
}

describe("login throttling", () => {
  beforeEach(() => {
    __test__.reset();
    process.env.LLM_GATEWAY_PEER_TOKEN = "peer-token";
    delete process.env.TRUST_PROXY;
  });

  it("does not trust client-supplied real IPs", () => {
    expect(getClientIp(request({ "x-llm-gateway-real-ip": "1.1.1.1" }))).toBe("unknown");
  });

  it("uses a real IP stamped by the trusted wrapper", () => {
    expect(getClientIp(request({
      "x-llm-gateway-real-ip": "203.0.113.9",
      "x-llm-gateway-peer-token": "peer-token",
    }))).toBe("203.0.113.9");
  });

  it("locks a client after five failures", () => {
    const now = Date.now();
    for (let index = 0; index < 5; index += 1) recordFailure("client", now);
    expect(checkLock("client", now)).toEqual({ locked: true, retryAfter: 30 });
  });
});

const routeMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  cookies: vi.fn(),
  setDashboardAuthCookie: vi.fn(),
  isLocalRequest: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: { json: vi.fn((body, init = {}) => ({ body, status: init.status || 200, headers: init.headers })) },
}));
vi.mock("next/headers", () => ({ cookies: routeMocks.cookies }));
vi.mock("@/lib/localDb", () => ({ getSettings: routeMocks.getSettings }));
vi.mock("@/lib/auth/dashboardSession", () => ({ setDashboardAuthCookie: routeMocks.setDashboardAuthCookie }));
vi.mock("@/lib/auth/oidc", () => ({ isOidcConfigured: vi.fn(() => false) }));
vi.mock("@/dashboardGuard", () => ({ isLocalRequest: routeMocks.isLocalRequest }));

const { POST } = await import("../../src/app/api/auth/login/route.js");

function loginRequest(password = "123456") {
  return {
    json: vi.fn(async () => ({ password })),
    headers: new Headers(),
  };
}

describe("default password remote login", () => {
  beforeEach(() => {
    __test__.reset();
    delete process.env.INITIAL_PASSWORD;
    routeMocks.getSettings.mockResolvedValue({ password: null, authMode: "password" });
    routeMocks.cookies.mockResolvedValue({});
    routeMocks.setDashboardAuthCookie.mockReset();
  });

  it("refuses to issue a session for the default password remotely", async () => {
    routeMocks.isLocalRequest.mockReturnValue(false);
    const response = await POST(loginRequest());
    expect(response.status).toBe(403);
    expect(response.body.mustChangePassword).toBe(true);
    expect(routeMocks.setDashboardAuthCookie).not.toHaveBeenCalled();
  });

  it("allows the default password from a trusted local session", async () => {
    routeMocks.isLocalRequest.mockReturnValue(true);
    const response = await POST(loginRequest());
    expect(response.status).toBe(200);
    expect(routeMocks.setDashboardAuthCookie).toHaveBeenCalledOnce();
  });
});
