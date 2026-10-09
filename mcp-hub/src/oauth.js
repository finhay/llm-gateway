// OAuth 2.1 Authorization Server for MCP clients (DCR + PKCE via the MCP SDK router),
// federating user identity to Google Workspace. Tokens: short-lived JWT access tokens,
// opaque rotating refresh tokens with an absolute login lifetime.
import { SignJWT, jwtVerify } from "jose";
import { InvalidGrantError, InvalidTokenError, InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { randomToken, sha256, nowSec, escapeHtml, page, audit } from "./util.js";

const PENDING_TTL = 10 * 60;
const CODE_TTL = 5 * 60;
export const PENDING_COOKIE = "hub_pending";

// Redirect hosts we recognise. Unknown hosts still work but get a visible warning
// on the consent screen (protects against phishing via dynamically registered clients).
const KNOWN_REDIRECTS = [
  /^https:\/\/claude\.ai\//, /^https:\/\/([a-z0-9-]+\.)?claude\.com\//,
  /^https:\/\/chatgpt\.com\//, /^https:\/\/chat\.openai\.com\//,
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//,
  /^(cursor|vscode|vscode-insiders|windsurf):\/\//,
];

export function isAllowedRedirect(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  // Custom schemes for desktop apps (cursor://, vscode://). Block script-ish schemes.
  return !["javascript:", "data:", "file:", "vbscript:"].includes(u.protocol);
}

export function createOAuthProvider({ cfg, store, google }) {
  const secret = cfg.jwtSecret;
  const issuer = cfg.publicUrl;
  const googleRedirect = `${issuer}/oauth/google/callback`;

  const clientsStore = {
    getClient: (id) => store.clients.get(id),
    registerClient(client) {
      const uris = client.redirect_uris || [];
      if (!uris.length || !uris.every(isAllowedRedirect)) {
        throw new InvalidClientMetadataError("redirect_uris must be https, loopback http, or an app scheme");
      }
      return store.clients.put(client);
    },
  };

  async function issueTokens({ email, clientId, scopes, resource, loginAt }) {
    const exp = nowSec() + cfg.accessTokenTtlSec;
    const access = await new SignJWT({ client_id: clientId, scope: scopes.join(" "), typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer).setSubject(email).setAudience(resource || issuer)
      .setIssuedAt().setExpirationTime(exp).sign(secret);
    const refresh = randomToken();
    store.refresh.putUntil(sha256(refresh), { email, clientId, scopes, resource, loginAt },
      loginAt + cfg.loginMaxAgeSec);
    return {
      access_token: access,
      token_type: "bearer",
      expires_in: cfg.accessTokenTtlSec,
      refresh_token: refresh,
      scope: scopes.join(" "),
    };
  }

  const provider = {
    clientsStore,

    // Step 1: render consent. We do NOT bounce straight to Google: the user must see
    // which app (and redirect host) is asking, bound to this browser via cookie.
    async authorize(client, params, res) {
      const id = randomToken();
      store.pending.put(id, {
        kind: "mcp",
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        scopes: params.scopes?.length ? params.scopes : ["mcp"],
        resource: params.resource?.href,
        nonce: randomToken(16),
      }, PENDING_TTL);
      const host = new URL(params.redirectUri).origin;
      const known = KNOWN_REDIRECTS.some((re) => re.test(params.redirectUri));
      res.cookie(PENDING_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: issuer.startsWith("https"), path: "/", maxAge: PENDING_TTL * 1000 });
      res.status(200).type("html").send(page("Cho phép truy cập Finhay MCP Hub", `
        <h2>Cho phép truy cập Finhay MCP Hub?</h2>
        <div class="card">
          <p><b>${escapeHtml(client.client_name || "Ứng dụng không tên")}</b> muốn dùng công cụ nội bộ Finhay thay mặt bạn.</p>
          <p class="muted">Kết quả sẽ được gửi về: <code>${escapeHtml(host)}</code></p>
          ${known ? "" : `<p class="warn">⚠️ Địa chỉ này không nằm trong danh sách client quen thuộc. Chỉ đồng ý nếu chính bạn vừa thêm MCP này.</p>`}
        </div>
        <form method="post" action="/oauth/consent">
          <input type="hidden" name="id" value="${escapeHtml(id)}">
          <button type="submit">Đồng ý và đăng nhập Google</button>
        </form>`));
    },

    async challengeForAuthorizationCode(client, code) {
      const data = store.codes.get(sha256(code));
      if (!data || data.clientId !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
      return data.codeChallenge;
    },

    async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
      const data = store.codes.take(sha256(code));
      if (!data || data.clientId !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
      if (redirectUri && redirectUri !== data.redirectUri) throw new InvalidGrantError("redirect_uri mismatch");
      if (resource && data.resource && resource.href !== data.resource) throw new InvalidGrantError("resource mismatch");
      audit({ event: "token.issued", email: data.email, client: client.client_id, resource: data.resource || issuer });
      return issueTokens({ email: data.email, clientId: client.client_id, scopes: data.scopes, resource: data.resource, loginAt: data.loginAt });
    },

    async exchangeRefreshToken(client, refreshToken, scopes, resource) {
      const data = store.refresh.take(sha256(refreshToken));
      if (!data || data.clientId !== client.client_id) throw new InvalidGrantError("Invalid refresh token");
      if (resource && data.resource && resource.href !== data.resource) throw new InvalidGrantError("resource mismatch");
      const granted = scopes?.length ? scopes.filter((s) => data.scopes.includes(s)) : data.scopes;
      return issueTokens({ ...data, scopes: granted });
    },

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, secret, { issuer, algorithms: ["HS256"] });
        if (payload.typ !== "access") throw new Error("wrong token type");
        return {
          token,
          clientId: payload.client_id,
          scopes: String(payload.scope || "").split(" ").filter(Boolean),
          expiresAt: payload.exp,
          resource: new URL(Array.isArray(payload.aud) ? payload.aud[0] : payload.aud),
          extra: { email: payload.sub },
        };
      } catch {
        throw new InvalidTokenError("Invalid or expired access token");
      }
    },

    async revokeToken(client, { token }) {
      const data = store.refresh.get(sha256(token));
      if (data && data.clientId === client.client_id) store.refresh.del(sha256(token));
    },
  };

  // Express routes owned by the hub (outside the SDK router).
  function mountRoutes(app) {
    // Step 2: user approved; continue to Google.
    app.post("/oauth/consent", async (req, res) => {
      const id = String(req.body?.id || "");
      const pending = store.pending.get(id);
      if (!pending || req.cookies[PENDING_COOKIE] !== id) {
        return res.status(400).type("html").send(page("Lỗi", "<p>Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy thử thêm lại MCP.</p>"));
      }
      res.redirect(302, await google.authorizationUrl({ redirectUri: googleRedirect, state: id, nonce: pending.nonce }));
    });

    // Step 3: Google returns. Serves both MCP-client logins and portal logins.
    app.get("/oauth/google/callback", async (req, res) => {
      const id = String(req.query.state || "");
      const pending = store.pending.take(id);
      if (!pending || req.cookies[PENDING_COOKIE] !== id) {
        return res.status(400).type("html").send(page("Lỗi", "<p>Phiên đăng nhập không hợp lệ (state mismatch).</p>"));
      }
      res.clearCookie(PENDING_COOKIE, { path: "/" });
      let user;
      try {
        user = await google.exchange({ code: String(req.query.code || ""), redirectUri: googleRedirect, nonce: pending.nonce });
      } catch (err) {
        audit({ event: "login.denied", reason: err.message });
        if (pending.kind === "mcp") {
          const u = new URL(pending.redirectUri);
          u.searchParams.set("error", "access_denied");
          u.searchParams.set("error_description", "Google Workspace login rejected");
          if (pending.state) u.searchParams.set("state", pending.state);
          return res.redirect(302, u.toString());
        }
        return res.status(403).type("html").send(page("Từ chối", "<p>Chỉ tài khoản Google Workspace của Finhay được phép.</p>"));
      }
      audit({ event: "login.ok", email: user.email, flow: pending.kind });

      if (pending.kind === "portal") {
        const session = await signSession(user);
        res.cookie(SESSION_COOKIE, session, { httpOnly: true, sameSite: "lax", secure: issuer.startsWith("https"), path: "/", maxAge: SESSION_TTL * 1000 });
        return res.redirect(302, pending.returnTo || "/connections");
      }

      const code = randomToken();
      store.codes.put(sha256(code), {
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        scopes: pending.scopes,
        resource: pending.resource,
        email: user.email,
        loginAt: nowSec(),
      }, CODE_TTL);
      const u = new URL(pending.redirectUri);
      u.searchParams.set("code", code);
      if (pending.state) u.searchParams.set("state", pending.state);
      res.redirect(302, u.toString());
    });
  }

  // ---- Portal browser session (separate audience from MCP access tokens) ----
  const SESSION_COOKIE = "hub_session";
  const SESSION_TTL = 8 * 3600;
  async function signSession(user) {
    return new SignJWT({ name: user.name, csrf: randomToken(16), typ: "portal" })
      .setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience(`${issuer}/portal`)
      .setSubject(user.email).setIssuedAt().setExpirationTime(nowSec() + SESSION_TTL).sign(secret);
  }
  async function readSession(req) {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return null;
    try {
      const { payload } = await jwtVerify(raw, secret, { issuer, audience: `${issuer}/portal`, algorithms: ["HS256"] });
      return payload.typ === "portal" ? { email: payload.sub, name: payload.name, csrf: payload.csrf } : null;
    } catch { return null; }
  }
  async function startPortalLogin(res, returnTo) {
    const id = randomToken();
    const nonce = randomToken(16);
    store.pending.put(id, { kind: "portal", returnTo, nonce }, PENDING_TTL);
    res.cookie(PENDING_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: issuer.startsWith("https"), path: "/", maxAge: PENDING_TTL * 1000 });
    res.redirect(302, await google.authorizationUrl({ redirectUri: googleRedirect, state: id, nonce }));
  }

  return { provider, mountRoutes, readSession, startPortalLogin, SESSION_COOKIE };
}
