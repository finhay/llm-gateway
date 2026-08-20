// Regression: deleting an API key must actually remove it — it used to soft-revoke,
// so the key reappeared (as "Paused") on the next page load.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-gateway-key-delete-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("deleteApiKey", () => {
  it("removes the key for good — it does not come back on re-read", async () => {
    const doomed = await db.createApiKey("Prod key", "machine-1");
    const kept = await db.createApiKey("tuantm", "machine-1");

    expect(await db.deleteApiKey(doomed.id)).toBe(true);
    expect(await db.getApiKeyById(doomed.id)).toBeNull();

    // getApiKeys() is what the dashboard reloads from.
    const remaining = await db.getApiKeys();
    expect(remaining.map((k) => k.id)).toEqual([kept.id]);

    // A deleted key must no longer authenticate.
    expect(await db.validateApiKey(doomed.key)).toBeFalsy();
  });

  it("returns false for an unknown id", async () => {
    expect(await db.deleteApiKey("no-such-key")).toBe(false);
  });

  it("records the deletion in the admin audit trail", async () => {
    const doomed = await db.createApiKey("Audited key", "machine-1");
    await db.deleteApiKey(doomed.id);

    const events = await db.getApiKeyAdminEvents(doomed.id);
    expect(events.map((e) => e.action)).toContain("deleted");
    expect(events.find((e) => e.action === "deleted").beforeJson.name).toBe("Audited key");
  });

  it("revokeApiKey still keeps the key on file, disabled", async () => {
    const key = await db.createApiKey("Paused key", "machine-1");
    await db.revokeApiKey(key.id, { type: "user", id: "u1" }, "compromised");

    const stored = await db.getApiKeyById(key.id);
    expect(stored).not.toBeNull();
    expect(stored.isActive).toBe(false);
    expect(stored.status).toBe("revoked");
    expect((await db.getApiKeys()).map((k) => k.id)).toContain(key.id);
  });
});
