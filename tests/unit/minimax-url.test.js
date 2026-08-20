import { describe, expect, it } from "vitest";

import { DefaultExecutor } from "open-sse/executors/default.js";
import { buildProviderUrl } from "open-sse/services/provider.js";

describe("MiniMax Anthropic endpoint", () => {
  it("uses the documented international endpoint without a legacy beta query", () => {
    const expected = "https://api.minimax.io/anthropic/v1/messages";

    expect(buildProviderUrl("minimax", "MiniMax-M2.7")).toBe(expected);
    expect(new DefaultExecutor("minimax").buildUrl("MiniMax-M2.7", true)).toBe(expected);
  });

  it("uses the China endpoint without a legacy beta query", () => {
    expect(new DefaultExecutor("minimax-cn").buildUrl("MiniMax-M2.7", true)).toBe(
      "https://api.minimaxi.com/anthropic/v1/messages",
    );
  });

  it("preserves the beta query for other providers that still use it", () => {
    expect(buildProviderUrl("glm", "glm-4.7")).toMatch(/\?beta=true$/);
    expect(new DefaultExecutor("kimi").buildUrl("kimi-latest", true)).toMatch(/\?beta=true$/);
  });
});
