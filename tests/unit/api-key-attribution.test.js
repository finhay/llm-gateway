// Regression: with "Require API key" off, the gateway skipped the key lookup entirely,
// so usage was filed under a plain-SHA256 hash of the raw key (e.g. "dd9c1078a6ca") that
// nothing could ever resolve back to a name. The key must still be resolved for
// attribution — without gaining the power to reject a request.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;
let auth;
let getConsistentMachineId;
let key;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-gateway-attribution-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  auth = await import("@/sse/services/auth.js");
  ({ getConsistentMachineId } = await import("@/shared/utils/machineId.js"));
  key = await db.createApiKey("tuantm", "machine-1");
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

const request = (rawKey) =>
  new Request("http://localhost:9000/v1/chat/completions", {
    method: "POST",
    headers: rawKey ? { Authorization: `Bearer ${rawKey}` } : {},
  });

const authenticate = (rawKey) =>
  auth.authenticateApiKey(request(rawKey), { requiredScope: auth.API_KEY_SCOPES.CHAT_WRITE });

describe("authenticateApiKey — attribution vs enforcement", () => {
  describe("requireApiKey off", () => {
    beforeEach(async () => {
      await db.updateSettings({ requireApiKey: false });
    });

    it("resolves the key record so usage can be attributed", async () => {
      const result = await authenticate(key.key);
      expect(result.ok).toBe(true);
      expect(result.enforced).toBe(false);
      expect(result.keyRecord?.id).toBe(key.id);
      expect(result.keyRecord?.name).toBe("tuantm");
    });

    it("still admits an unknown or absent key, just unattributed", async () => {
      for (const raw of ["sk-not-a-real-key", null]) {
        const result = await authenticate(raw);
        expect(result.ok, `raw=${raw}`).toBe(true);
        expect(result.keyRecord, `raw=${raw}`).toBeNull();
      }
    });

    it("records lastUsedAt for the resolved key", async () => {
      const fresh = await db.createApiKey("last-used probe", "machine-1");
      expect((await db.getApiKeyById(fresh.id)).lastUsedAt).toBeFalsy();
      await authenticate(fresh.key);
      expect((await db.getApiKeyById(fresh.id)).lastUsedAt).toBeTruthy();
    });

    it("end-to-end: usage stats show the key name, not a hash", async () => {
      const resolved = await authenticate(key.key);
      await db.saveRequestUsage({
        provider: "minimax",
        model: "MiniMax-M3",
        endpoint: "/v1/chat/completions",
        status: "ok",
        tokens: { prompt_tokens: 100, completion_tokens: 50 },
        apiKey: resolved.rawKey,
        apiKeyRecord: resolved.keyRecord,
      });

      for (const period of ["24h", "7d"]) {
        const entry = Object.values((await db.getUsageStats(period)).byApiKey)
          .find((e) => e.rawModel === "MiniMax-M3");
        expect(entry, `period ${period}`).toBeDefined();
        expect(entry.keyName, `period ${period}`).toBe("tuantm");
        expect(entry.apiKeyId, `period ${period}`).toBe(key.id);
        expect(entry.keyPrefix, `period ${period}`).toBe(key.keyPrefix);
      }
    });
  });

  describe("requireApiKey on — enforcement unchanged", () => {
    beforeEach(async () => {
      await db.updateSettings({ requireApiKey: true });
    });

    it("accepts a valid key and marks it enforced", async () => {
      const result = await authenticate(key.key);
      expect(result.ok).toBe(true);
      expect(result.enforced).toBe(true);
      expect(result.keyRecord?.name).toBe("tuantm");
    });

    it("rejects an unknown key", async () => {
      const result = await authenticate("sk-not-a-real-key");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it("rejects a missing key", async () => {
      const result = await authenticate(null);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it("accepts an authenticated loopback request used by dashboard model tests", async () => {
      const internalRequest = new Request("http://127.0.0.1:20128/api/v1/chat/completions", {
        method: "POST",
        headers: { "x-9r-internal-token": await getConsistentMachineId() },
      });
      const result = await auth.authenticateApiKey(internalRequest, {
        requiredScope: auth.API_KEY_SCOPES.CHAT_WRITE,
      });

      expect(result.ok).toBe(true);
      expect(result.internal).toBe(true);
    });

    it("rejects a revoked key", async () => {
      const revoked = await db.createApiKey("revoked", "machine-1");
      await db.revokeApiKey(revoked.id, { type: "user", id: "u1" }, "compromised");
      const result = await authenticate(revoked.key);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });
  });

  it("a provider allowlist only rejects while enforcement is on", async () => {
    const scoped = await db.createApiKey("scoped", "machine-1", { allowedProviders: ["openai"] });

    await db.updateSettings({ requireApiKey: false });
    const off = await authenticate(scoped.key);
    // Record is resolved for attribution, but callers must not act on the allowlist.
    expect(off.enforced).toBe(false);
    expect(auth.isProviderAllowed(off.keyRecord, "minimax")).toBe(false);

    await db.updateSettings({ requireApiKey: true });
    const on = await authenticate(scoped.key);
    expect(on.enforced).toBe(true);
    expect(auth.isProviderAllowed(on.keyRecord, "minimax")).toBe(false);
    expect(auth.isProviderAllowed(on.keyRecord, "openai")).toBe(true);
  });
});
