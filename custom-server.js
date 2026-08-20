const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const originalCreateServer = http.createServer.bind(http);

// Proves that x-llm-gateway-real-ip came from this process's TCP socket rather
// than from a client-controlled header.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.LLM_GATEWAY_PEER_TOKEN = PEER_TOKEN;

function isLoopback(address) {
  const normalized = String(address || "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

// Wrap Next's HTTP server and replace every client-supplied forwarding/trust
// header with values derived from the actual socket. Forwarded addresses are
// accepted only from a reverse proxy connected over loopback.
http.createServer = (...args) => {
  const handler = args.find((arg) => typeof arg === "function");
  const rest = args.filter((arg) => typeof arg !== "function");
  if (!handler) return originalCreateServer(...args);

  const wrapped = (req, res) => {
    const socketIp = req.socket?.remoteAddress || "";
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedRealIp = req.headers["x-real-ip"];
    const viaProxy = Boolean(forwardedFor || forwardedRealIp);
    const proxyIp = forwardedRealIp || (forwardedFor ? String(forwardedFor).split(",")[0].trim() : "");
    const clientIp = isLoopback(socketIp) && proxyIp ? proxyIp : socketIp;

    delete req.headers["x-llm-gateway-real-ip"];
    delete req.headers["x-llm-gateway-peer-token"];
    delete req.headers["x-llm-gateway-via-proxy"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-real-ip"];

    req.headers["x-llm-gateway-real-ip"] = clientIp;
    req.headers["x-llm-gateway-peer-token"] = PEER_TOKEN;
    if (viaProxy) req.headers["x-llm-gateway-via-proxy"] = "1";

    return handler(req, res);
  };

  return originalCreateServer(...rest, wrapped);
};

if (require.main === module) {
  const standaloneServer = path.join(__dirname, "server.js");
  if (fs.existsSync(standaloneServer)) {
    require(standaloneServer);
  } else {
    const nextBin = require.resolve("next/dist/bin/next");
    process.argv = [process.argv[0], nextBin, "start", ...process.argv.slice(2)];
    require(nextBin);
  }
}
