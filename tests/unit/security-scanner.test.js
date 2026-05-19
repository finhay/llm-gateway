import { describe, expect, it, vi } from "vitest";

import { scanText as scanSecrets } from "../../src/internal/secrets/scanner.js";
import { redactText } from "../../src/internal/secrets/redactor.js";
import { scanText as scanDlp } from "../../src/internal/dlp/scanner.js";
import { classifyDlp } from "../../src/internal/dlp/classifier.js";
import { walkTextNodes } from "../../src/internal/walker/walkTextNodes.js";
import { isProviderAllowed } from "../../src/internal/policy/providerRisk.js";

vi.mock("../../src/lib/db/driver.js", () => ({
  getAdapter: vi.fn(async () => ({
    transaction: (fn) => fn(),
    run: vi.fn(),
  })),
}));

describe("security scanner", () => {
  it("detects and redacts non-critical secrets", () => {
    const text = "token ghp_1234567890abcdefghij1234567890abcdef done";
    const matches = scanSecrets(text, "messages[0].content");

    expect(matches[0]).toMatchObject({ type: "github_token", severity: "high" });
    expect(matches[0].rawValue).toBe(text.slice(matches[0].start, matches[0].end));
    expect(redactText(text, matches)).toContain("[REDACTED_GITHUB_TOKEN]");
  });

  it("marks private keys as critical", () => {
    const text = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----";
    const matches = scanSecrets(text, "messages[0].content");

    expect(matches[0]).toMatchObject({ type: "pem_private_key", severity: "critical" });
  });

  it("classifies customer PII", () => {
    const matches = scanDlp("customer SSN 123-45-6789 and card 4111 1111 1111 1111", "messages[0].content");

    expect(matches.map((m) => m.type)).toEqual(expect.arrayContaining(["national_id", "credit_card"]));
    expect(classifyDlp(matches)).toBe("customer_pii");
  });

  it("does not classify token digit runs as phone numbers", () => {
    const matches = scanDlp("GitHub token: ghp_1234567890abcdefghij1234567890abcdef", "tester.text");

    expect(matches.map((m) => m.type)).not.toContain("phone_number");
  });

  it("skips disabled detectors", () => {
    const secretMatches = scanSecrets(
      "token ghp_1234567890abcdefghij1234567890abcdef",
      "tester.text",
      { github_token: { enabled: false } }
    );
    const piiMatches = scanDlp(
      "phone +1 415 555 1212 and email customer@example.com",
      "tester.text",
      [],
      { phone_number: { enabled: false } }
    );

    expect(secretMatches.map((m) => m.type)).not.toContain("github_token");
    expect(piiMatches.map((m) => m.type)).not.toContain("phone_number");
    expect(piiMatches.map((m) => m.type)).toContain("email");
  });

  it("walks OpenAI and Gemini text nodes", () => {
    const openai = { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] };
    const gemini = { contents: [{ parts: [{ text: "hello" }] }] };

    expect(walkTextNodes(openai, "openai").map((n) => n.path)).toEqual(["messages[0].content[0].text"]);
    expect(walkTextNodes(gemini, "gemini").map((n) => n.path)).toEqual(["contents[0].parts[0].text"]);
  });

  it("restricts customer PII to low-risk providers", () => {
    expect(isProviderAllowed("anthropic-api", "customer_pii")).toBe(true);
    expect(isProviderAllowed("kiro", "customer_pii")).toBe(false);
    expect(isProviderAllowed("unknown-provider", "customer_pii")).toBe(false);
  });
});
