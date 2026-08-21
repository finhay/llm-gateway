import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-machine-id", () => ({
  machineIdSync: vi.fn(() => {
    throw new Error("machine-id unavailable in container");
  }),
}));

const CACHE_KEY = "__llmGatewayConsistentMachineIds";

beforeEach(() => {
  delete globalThis[CACHE_KEY];
  vi.resetModules();
});

afterEach(() => {
  delete globalThis[CACHE_KEY];
  vi.resetModules();
});

describe("getConsistentMachineId container fallback", () => {
  it("returns the same fallback token across calls and module instances", async () => {
    const firstModule = await import("@/shared/utils/machineId.js");
    const first = await firstModule.getConsistentMachineId();

    vi.resetModules();
    const secondModule = await import("@/shared/utils/machineId.js");
    const second = await secondModule.getConsistentMachineId();

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });
});
