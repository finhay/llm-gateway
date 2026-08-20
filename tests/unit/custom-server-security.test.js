import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
let server;
let baseUrl;
let seenHeaders;

beforeAll(async () => {
  require("../../custom-server.js");
  server = http.createServer((req, res) => {
    seenHeaders = req.headers;
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function send(headers = {}) {
  await fetch(baseUrl, { headers });
  return seenHeaders;
}

describe("custom server security headers", () => {
  it("creates an unpredictable per-process peer token", () => {
    expect(process.env.LLM_GATEWAY_PEER_TOKEN).toMatch(/^[0-9a-f]{48}$/);
  });

  it("replaces client-supplied trust headers", async () => {
    const headers = await send({
      "x-llm-gateway-real-ip": "203.0.113.55",
      "x-llm-gateway-peer-token": "forged",
    });
    expect(headers["x-llm-gateway-real-ip"]).toMatch(/^(::ffff:)?127\.0\.0\.1$/);
    expect(headers["x-llm-gateway-peer-token"]).toBe(process.env.LLM_GATEWAY_PEER_TOKEN);
  });

  it("uses forwarded IPs only for a loopback reverse proxy and removes XFF", async () => {
    const headers = await send({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(headers["x-llm-gateway-real-ip"]).toBe("203.0.113.9");
    expect(headers["x-llm-gateway-via-proxy"]).toBe("1");
    expect(headers["x-forwarded-for"]).toBeUndefined();
  });
});
