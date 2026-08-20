// The real-IP header is trustworthy only when custom-server.js proves it
// stamped the value from the TCP socket using this process-local secret.
export function hasTrustedPeerHeaders(request) {
  const token = process.env.LLM_GATEWAY_PEER_TOKEN;
  return Boolean(token) && request.headers.get("x-llm-gateway-peer-token") === token;
}
