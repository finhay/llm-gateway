// Google Workspace OIDC (upstream identity). The hub is the OAuth AS for MCP
// clients and federates user login to Google.
import { createRemoteJWKSet, jwtVerify } from "jose";

export function createGoogle(cfg, { fetchImpl = fetch } = {}) {
  let discovery = null;
  let jwks = null;

  async function load() {
    if (discovery) return discovery;
    const res = await fetchImpl(`${cfg.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
    discovery = await res.json();
    jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    return discovery;
  }

  return {
    async authorizationUrl({ redirectUri, state, nonce }) {
      const d = await load();
      const u = new URL(d.authorization_endpoint);
      u.search = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce,
        prompt: "select_account",
        // UI hint only; the real domain check happens on the verified ID token.
        ...(cfg.allowedDomains.length === 1 ? { hd: cfg.allowedDomains[0] } : {}),
      }).toString();
      return u.toString();
    },

    // Exchange code, verify ID token, enforce Workspace domain. Returns identity.
    async exchange({ code, redirectUri, nonce }) {
      const d = await load();
      const res = await fetchImpl(d.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        }),
      });
      if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
      const tokens = await res.json();
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer: d.issuer,
        audience: cfg.clientId,
      });
      if (payload.nonce !== nonce) throw new Error("ID token nonce mismatch");
      const email = String(payload.email || "").toLowerCase();
      if (!email || payload.email_verified !== true) throw new Error("Email not verified");
      const domain = email.split("@")[1];
      // `hd` is only present for Workspace accounts; require it to match too.
      if (!cfg.allowedDomains.includes(domain) || !cfg.allowedDomains.includes(String(payload.hd || "").toLowerCase())) {
        throw new Error("Account is not in an allowed Google Workspace domain");
      }
      return { email, name: payload.name || email, sub: payload.sub };
    },
  };
}
