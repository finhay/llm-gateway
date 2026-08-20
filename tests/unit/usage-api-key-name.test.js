// Regression: "Usage by API Key" must show the key's real name, not a truncated prefix.
// usageHistory/usageDaily store the keyPrefix (or key id) — never the raw key — so the
// name lookup has to be indexed by those identifiers.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-gateway-key-name-"));
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

const BASE = {
  provider: "openai",
  tokens: { prompt_tokens: 10, completion_tokens: 5 },
  endpoint: "/v1/chat",
  status: "ok",
};

describe("getUsageStats — byApiKey key names", () => {
  it("resolves keyName from the stored keyPrefix in both live and daily paths", async () => {
    const key = await db.createApiKey("Prod key", "machine-1");
    await db.saveRequestUsage({
      ...BASE,
      model: "gpt-4",
      apiKeyRecord: { id: key.id, keyPrefix: key.keyPrefix },
    });

    // "24h" reads live usageHistory rows; "7d" reads the usageDaily aggregate.
    for (const period of ["24h", "7d"]) {
      const entries = Object.values((await db.getUsageStats(period)).byApiKey);
      const entry = entries.find((e) => e.rawModel === "gpt-4");
      expect(entry, `period ${period}`).toBeDefined();
      expect(entry.keyName, `period ${period}`).toBe("Prod key");
      expect(entry.apiKeyId, `period ${period}`).toBe(key.id);
    }
  });

  it("keeps the name for a revoked key and labels keyless traffic", async () => {
    const revoked = await db.createApiKey("Retired key", "machine-2");
    await db.saveRequestUsage({
      ...BASE,
      model: "gpt-4o",
      apiKeyRecord: { id: revoked.id, keyPrefix: revoked.keyPrefix },
    });
    await db.saveRequestUsage({ ...BASE, model: "gpt-3.5" });
    // Revoked keys stay on file, so their name is still resolvable.
    await db.revokeApiKey(revoked.id, { type: "user", id: "u1" }, "compromised");

    for (const period of ["24h", "7d"]) {
      const entries = Object.values((await db.getUsageStats(period)).byApiKey);
      expect(entries.find((e) => e.rawModel === "gpt-4o").keyName, `period ${period}`).toBe("Retired key");
      expect(entries.find((e) => e.rawModel === "gpt-3.5").keyName, `period ${period}`).toBe("Local (No API Key)");
    }
  });

  it("falls back to the prefix once the key is hard deleted", async () => {
    const doomed = await db.createApiKey("Doomed key", "machine-3");
    await db.saveRequestUsage({
      ...BASE,
      model: "gpt-4.1",
      apiKeyRecord: { id: doomed.id, keyPrefix: doomed.keyPrefix },
    });

    for (const period of ["24h", "7d"]) {
      const entries = Object.values((await db.getUsageStats(period)).byApiKey);
      expect(entries.find((e) => e.rawModel === "gpt-4.1").keyName, `period ${period}`).toBe("Doomed key");
    }

    await db.deleteApiKey(doomed.id);

    for (const period of ["24h", "7d"]) {
      const entries = Object.values((await db.getUsageStats(period)).byApiKey);
      const entry = entries.find((e) => e.rawModel === "gpt-4.1");
      // The usage row survives the key; the name is no longer resolvable.
      expect(entry, `period ${period}`).toBeDefined();
      expect(entry.keyName, `period ${period}`).toBe(`${doomed.keyPrefix.slice(0, 8)}...`);
    }
  });

  it("tells apart two keys minted on the same machine", async () => {
    // keyPrefix is `sk-{machineId}` truncated, so keys from one machine share it.
    // Grouping must key off the key id or their usage merges under one name.
    const machine = "1e8ccee28abcdef0";
    const first = await db.createApiKey("Prod key", machine);
    const second = await db.createApiKey("tuantm", machine);
    expect(first.keyPrefix).toBe(second.keyPrefix);

    const usage = { ...BASE, model: "MiniMax-M3", provider: "minimax" };
    for (let i = 0; i < 3; i++) {
      await db.saveRequestUsage({ ...usage, apiKeyRecord: { id: first.id, keyPrefix: first.keyPrefix } });
    }
    for (let i = 0; i < 5; i++) {
      await db.saveRequestUsage({ ...usage, apiKeyRecord: { id: second.id, keyPrefix: second.keyPrefix } });
    }

    for (const period of ["24h", "7d"]) {
      const byName = Object.fromEntries(
        Object.values((await db.getUsageStats(period)).byApiKey)
          .filter((e) => e.rawModel === "MiniMax-M3")
          .map((e) => [e.keyName, e.requests])
      );
      expect(byName, `period ${period}`).toEqual({ "Prod key": 3, "tuantm": 5 });
    }
  });
});
