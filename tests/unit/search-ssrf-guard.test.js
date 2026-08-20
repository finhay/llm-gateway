import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "../../open-sse/handlers/search/callers.js";

const config = { baseUrl: "https://search.example.com" };

describe("search base URL SSRF guard", () => {
  it("allows the configured URL and public overrides", () => {
    expect(resolveBaseUrl(config, {})).toBe("https://search.example.com");
    expect(resolveBaseUrl(config, { providerOptions: { baseUrl: "https://public.example.net/" } }))
      .toBe("https://public.example.net");
  });

  it.each([
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]",
    "file:///etc/passwd",
    "gopher://127.0.0.1",
  ])("rejects %s", (baseUrl) => {
    expect(() => resolveBaseUrl(config, { providerOptions: { baseUrl } })).toThrow();
  });
});
