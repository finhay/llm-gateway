import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "ENABLE_REQUEST_LOGS",
  "REQUEST_LOG_DIR",
  "REQUEST_LOG_MAX_TOTAL_MB",
  "REQUEST_LOG_MAX_SESSION_MB",
  "REQUEST_LOG_MAX_FILE_MB",
  "REQUEST_LOG_RETENTION_DAYS",
  "REQUEST_LOG_PRUNE_INTERVAL_MS",
];

let originalEnv;
let tempDir;

function directoryBytes(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return total + directoryBytes(fullPath);
    if (entry.isFile()) return total + fs.statSync(fullPath).size;
    return total;
  }, 0);
}

beforeEach(() => {
  originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-gateway-request-logs-"));
  Object.assign(process.env, {
    ENABLE_REQUEST_LOGS: "true",
    REQUEST_LOG_DIR: tempDir,
    REQUEST_LOG_MAX_TOTAL_MB: "1",
    REQUEST_LOG_MAX_SESSION_MB: "1",
    REQUEST_LOG_MAX_FILE_MB: "1",
    REQUEST_LOG_RETENTION_DAYS: "1",
    REQUEST_LOG_PRUNE_INTERVAL_MS: "1000",
  });
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("request log retention", () => {
  it("redacts credentials, removes expired sessions, and enforces the total quota", async () => {
    const expiredDir = path.join(tempDir, "expired-session");
    fs.mkdirSync(expiredDir);
    fs.writeFileSync(path.join(expiredDir, "old.log"), "old");
    const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(expiredDir, "old.log"), oldDate, oldDate);
    fs.utimesSync(expiredDir, oldDate, oldDate);

    const { createRequestLogger } = await import("../../open-sse/utils/requestLogger.js");
    const first = await createRequestLogger("claude", "openai", "first-model");
    first.logClientRawRequest("/v1/messages", {}, {
      authorization: "Bearer secret",
      "x-api-key": "secret-two",
      accept: "text/event-stream",
    });
    first.appendProviderChunk("a".repeat(800 * 1024));

    const second = await createRequestLogger("claude", "openai", "second-model");
    second.appendProviderChunk("b".repeat(800 * 1024));

    expect(fs.existsSync(expiredDir)).toBe(false);
    expect(directoryBytes(tempDir)).toBeLessThanOrEqual(1024 * 1024);

    const firstDir = fs.readdirSync(tempDir).find((name) => name.includes("first-model"));
    const request = JSON.parse(fs.readFileSync(path.join(tempDir, firstDir, "1_req_client.json"), "utf8"));
    expect(request.headers.authorization).toBe("[REDACTED]");
    expect(request.headers["x-api-key"]).toBe("[REDACTED]");
    expect(request.headers.accept).toBe("text/event-stream");
  });
});
