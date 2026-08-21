import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(() => Promise.resolve()),
  saveRequestUsage: vi.fn(() => Promise.resolve()),
}));

import { FORMATS } from "../../open-sse/translator/formats.js";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";

async function passThrough(source, format, { clientModel = null, onStreamComplete = null } = {}) {
  const input = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(source));
      controller.close();
    },
  });

  const output = input.pipeThrough(
    createPassthroughStreamWithLogger(
      "test-provider",
      null,
      "test-model",
      null,
      null,
      onStreamComplete,
      null,
      format,
      clientModel,
    ),
  );

  return new Response(output).text();
}

describe("passthrough SSE termination", () => {
  it("ends native Claude streams at message_stop without an OpenAI sentinel", async () => {
    const source = [
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
      "",
    ].join("\n");

    const result = await passThrough(source, FORMATS.CLAUDE);

    expect(result).toContain('data: {"type":"message_stop"}');
    expect(result).not.toContain("[DONE]");
  });

  it("still appends the sentinel required by OpenAI-compatible clients", async () => {
    const source = 'data: {"id":"chatcmpl-test","choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\n';

    const result = await passThrough(source, FORMATS.OPENAI);

    expect(result).toContain("data: [DONE]\n\n");
  });

  it("normalizes native Claude response identity to the selected alias", async () => {
    const source = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"06d7106a21cbc04865c9e50168daec62","type":"message","role":"assistant","content":[],"model":"MiniMax-M3","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":38,"output_tokens":2}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
      "",
    ].join("\n");
    const onStreamComplete = vi.fn();

    const result = await passThrough(source, FORMATS.CLAUDE, {
      clientModel: "claude-sonnet-m3",
      onStreamComplete,
    });

    expect(result).toContain('"id":"msg_06d7106a21cbc04865c9e50168daec62"');
    expect(result).toContain('"model":"claude-sonnet-m3"');
    expect(result).not.toContain('"model":"MiniMax-M3"');
    expect(onStreamComplete).toHaveBeenCalledWith(
      { content: "Hi", thinking: "" },
      expect.objectContaining({ prompt_tokens: 38, completion_tokens: 2 }),
      expect.any(Number),
    );
  });
});
