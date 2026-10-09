import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { loadConfig } from "../src/config.js";
import { openStore } from "../src/store.js";
import { createApp } from "../src/app.js";
import { createVault } from "../src/vault.js";

const listen = (handler) => new Promise((resolve) => {
  const srv = http.createServer(handler);
  srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
});
const b64url = (b) => b.toString("base64url");

let google, jira, hub, store, cfg;
let nextUser = { email: "an.nguyen@finhay.com.vn", hd: "finhay.com.vn" };
const GOOD_PAT = "pat-good-123456";

before(async () => {
  // ---- Fake Google OIDC ----
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const codes = new Map();
  google = await listen(async (req, res) => {
    const u = new URL(req.url, google.url);
    if (u.pathname === "/.well-known/openid-configuration") {
      return res.end(JSON.stringify({ issuer: google.url, authorization_endpoint: `${google.url}/auth`,
        token_endpoint: `${google.url}/token`, jwks_uri: `${google.url}/jwks` }));
    }
    if (u.pathname === "/jwks") return res.end(JSON.stringify({ keys: [jwk] }));
    if (u.pathname === "/auth") { // user "logs in" instantly as nextUser
      const code = crypto.randomUUID();
      codes.set(code, { nonce: u.searchParams.get("nonce"), user: nextUser, clientId: u.searchParams.get("client_id") });
      const back = new URL(u.searchParams.get("redirect_uri"));
      back.searchParams.set("code", code); back.searchParams.set("state", u.searchParams.get("state"));
      res.writeHead(302, { location: back.toString() }); return res.end();
    }
    if (u.pathname === "/token") {
      let body = ""; for await (const c of req) body += c;
      const p = new URLSearchParams(body);
      const entry = codes.get(p.get("code")); codes.delete(p.get("code"));
      if (!entry || p.get("client_secret") !== "gsecret") { res.writeHead(400); return res.end("{}"); }
      const id_token = await new SignJWT({ email: entry.user.email, email_verified: true, hd: entry.user.hd, nonce: entry.nonce, name: "Test User" })
        .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(google.url).setAudience(entry.clientId)
        .setSubject("g-" + entry.user.email).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return res.end(JSON.stringify({ id_token, access_token: "x", token_type: "Bearer" }));
    }
    res.writeHead(404); res.end();
  });

  // ---- Fake Jira Data Center ----
  jira = await listen((req, res) => {
    if (req.headers.authorization !== `Bearer ${GOOD_PAT}`) { res.writeHead(401); return res.end("{}"); }
    const u = new URL(req.url, "http://x");
    res.setHeader("content-type", "application/json");
    if (u.pathname === "/rest/api/2/myself") return res.end(JSON.stringify({ name: "an.nguyen", displayName: "An Nguyen" }));
    if (u.pathname === "/rest/api/2/search") {
      return res.end(JSON.stringify({ total: 1, issues: [{ key: "FIN-1", fields: {
        summary: "Card 4111 1111 1111 1111 leaked", status: { name: "Open" }, issuetype: { name: "Bug" },
        assignee: { displayName: "An Nguyen" }, updated: "2026-10-01" } }], jqlEcho: u.searchParams.get("jql") }));
    }
    if (u.pathname === "/rest/api/2/issue/FIN-1") {
      return res.end(JSON.stringify({ key: "FIN-1", fields: { summary: "S", status: { name: "Open" }, description: "desc" } }));
    }
    res.writeHead(404); res.end("{}");
  });

  // ---- Hub ----
  const port = await new Promise((r) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  cfg = loadConfig({
    MCP_HUB_PUBLIC_URL: `http://127.0.0.1:${port}`,
    MCP_HUB_VAULT_KEY: crypto.randomBytes(32).toString("base64"),
    MCP_HUB_JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    GOOGLE_OIDC_ISSUER: google.url, GOOGLE_CLIENT_ID: "gclient", GOOGLE_CLIENT_SECRET: "gsecret",
    MCP_HUB_ALLOWED_DOMAINS: "finhay.com.vn", JIRA_BASE_URL: jira.url,
  });
  store = openStore(":memory:");
  const app = createApp({ cfg, store });
  hub = await new Promise((r) => { const s = app.listen(port, "127.0.0.1", () => r({ srv: s, url: cfg.publicUrl })); });
});

after(() => { for (const s of [google, jira, hub]) s?.srv.close(); store?.close(); });

// ---------- helpers ----------
const getCookie = (res, name) => {
  const all = res.headers.getSetCookie?.() || [];
  const c = all.find((x) => x.startsWith(`${name}=`));
  return c ? c.split(";")[0].slice(name.length + 1) : null;
};
const nofollow = (url, opts = {}) => fetch(url, { redirect: "manual", ...opts });

async function registerClient(redirect = "http://127.0.0.1:9/cb") {
  const r = await fetch(`${hub.url}/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test Client", redirect_uris: [redirect], token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  return { status: r.status, body: await r.json() };
}

async function mcpLogin({ resource = `${hub.url}/atlassian` } = {}) {
  const { body: client } = await registerClient();
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const authUrl = new URL(`${hub.url}/authorize`);
  authUrl.search = new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0],
    code_challenge: challenge, code_challenge_method: "S256", state: "st1", scope: "mcp", ...(resource ? { resource } : {}) });
  const consent = await nofollow(authUrl);
  assert.equal(consent.status, 200);
  const html = await consent.text();
  assert.match(html, /Cho phép truy cập Finhay MCP Hub/);
  const pending = getCookie(consent, "hub_pending");
  const id = html.match(/name="id" value="([^"]+)"/)[1];
  const toGoogle = await nofollow(`${hub.url}/oauth/consent`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: `hub_pending=${pending}` }, body: `id=${id}` });
  assert.equal(toGoogle.status, 302);
  const gAuth = await nofollow(toGoogle.headers.get("location"));
  const cb = await nofollow(gAuth.headers.get("location"), { headers: { cookie: `hub_pending=${pending}` } });
  assert.equal(cb.status, 302);
  const back = new URL(cb.headers.get("location"));
  if (back.searchParams.get("error")) return { error: back.searchParams.get("error") };
  assert.equal(back.searchParams.get("state"), "st1");
  const tok = await fetch(`${hub.url}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code"), code_verifier: verifier,
      client_id: client.client_id, redirect_uri: client.redirect_uris[0], ...(resource ? { resource } : {}) }) });
  assert.equal(tok.status, 200, await tok.clone().text());
  return { client, tokens: await tok.json() };
}

async function portalLogin() {
  const start = await nofollow(`${hub.url}/connections/atlassian`);
  assert.equal(start.status, 302);
  const pending = getCookie(start, "hub_pending");
  const gAuth = await nofollow(start.headers.get("location"));
  const cb = await nofollow(gAuth.headers.get("location"), { headers: { cookie: `hub_pending=${pending}` } });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), "/connections/atlassian");
  return getCookie(cb, "hub_session");
}

let rpcId = 0;
async function mcp(token, method, params, path = "/atlassian") {
  const r = await fetch(`${hub.url}${path}`, { method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  return { status: r.status, headers: r.headers, body: r.status === 200 ? await r.json() : await r.text() };
}
const callTool = (token, name, args) => mcp(token, "tools/call", { name, arguments: args });

// ---------- tests ----------
test("unauthenticated MCP request gets 401 with resource metadata pointer", async () => {
  const r = await mcp(null, "tools/list", {});
  assert.equal(r.status, 401);
  assert.match(r.headers.get("www-authenticate"), /resource_metadata=".*\/\.well-known\/oauth-protected-resource\/atlassian"/);
  const meta = await (await fetch(`${hub.url}/.well-known/oauth-protected-resource/atlassian`)).json();
  assert.equal(meta.resource, `${hub.url}/atlassian`);
  assert.deepEqual(meta.authorization_servers, [hub.url]);
  const as = await (await fetch(`${hub.url}/.well-known/oauth-authorization-server`)).json();
  assert.ok(as.registration_endpoint && as.code_challenge_methods_supported.includes("S256"));
});

test("registration rejects non-loopback http and javascript redirect URIs", async () => {
  assert.equal((await registerClient("http://evil.example/cb")).status, 400);
  assert.equal((await registerClient("javascript:alert(1)")).status, 400);
  assert.equal((await registerClient("https://claude.ai/api/mcp/auth_callback")).status, 201);
});

test("full flow: OAuth → not connected → connect PAT in portal → tools work", async () => {
  const { tokens } = await mcpLogin();
  const list = await mcp(tokens.access_token, "tools/list", {});
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.result.tools.map((t) => t.name).sort(), ["jira_get_issue", "jira_search"]);

  const before = await callTool(tokens.access_token, "jira_search", { jql: "project = FIN" });
  assert.equal(before.body.result.isError, true);
  assert.match(before.body.result.content[0].text, /\/connections\/atlassian/);

  const session = await portalLogin();
  const form = await fetch(`${hub.url}/connections/atlassian`, { headers: { cookie: `hub_session=${session}` } });
  const csrf = (await form.text()).match(/name="csrf" value="([^"]+)"/)[1];

  const noCsrf = await nofollow(`${hub.url}/connections/atlassian`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: `hub_session=${session}` }, body: `credential=${GOOD_PAT}` });
  assert.equal(noCsrf.status, 403);
  const bad = await nofollow(`${hub.url}/connections/atlassian`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: `hub_session=${session}` }, body: `csrf=${csrf}&credential=wrong` });
  assert.equal(bad.status, 400);
  const ok = await nofollow(`${hub.url}/connections/atlassian`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: `hub_session=${session}` }, body: `csrf=${csrf}&credential=${GOOD_PAT}` });
  assert.equal(ok.status, 303);

  // Stored encrypted, bound to the user.
  const row = store.connections.get("an.nguyen@finhay.com.vn", "atlassian");
  assert.ok(!Buffer.from(row.enc.ciphertext).toString("utf8").includes(GOOD_PAT));
  assert.equal(row.meta.displayName, "An Nguyen");
  const vault = createVault(cfg.vaultKey);
  assert.equal(vault.decrypt("an.nguyen@finhay.com.vn", "atlassian", row.enc), GOOD_PAT);
  assert.throws(() => vault.decrypt("other@finhay.com.vn", "atlassian", row.enc));

  const res = await callTool(tokens.access_token, "jira_search", { jql: "project = FIN" });
  assert.equal(res.body.result.isError, undefined);
  const text = res.body.result.content[0].text;
  assert.match(text, /FIN-1/);
  assert.match(text, /\[REDACTED_CARD\]/);          // output redaction applied
  assert.doesNotMatch(text, /4111 1111/);

  const issue = await callTool(tokens.access_token, "jira_get_issue", { key: "FIN-1" });
  assert.match(issue.body.result.content[0].text, /"url": ".*\/browse\/FIN-1"/);
  const badKey = await callTool(tokens.access_token, "jira_get_issue", { key: "../../admin" });
  assert.equal(badKey.body.result?.isError ?? !!badKey.body.error, true);
});

test("non-Finhay Google account is denied", async () => {
  nextUser = { email: "hacker@gmail.com", hd: undefined };
  try {
    const r = await mcpLogin();
    assert.equal(r.error, "access_denied");
  } finally { nextUser = { email: "an.nguyen@finhay.com.vn", hd: "finhay.com.vn" }; }
});

test("consent POST without the browser-bound cookie is rejected (CSRF)", async () => {
  const { body: client } = await registerClient();
  const u = new URL(`${hub.url}/authorize`);
  u.search = new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0],
    code_challenge: "x".repeat(43), code_challenge_method: "S256" });
  const html = await (await nofollow(u)).text();
  const id = html.match(/name="id" value="([^"]+)"/)[1];
  const r = await nofollow(`${hub.url}/oauth/consent`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `id=${id}` });
  assert.equal(r.status, 400);
});

test("refresh tokens rotate and cannot be reused", async () => {
  const { client, tokens } = await mcpLogin();
  const refresh = (rt) => fetch(`${hub.url}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: client.client_id }) });
  const r1 = await refresh(tokens.refresh_token);
  assert.equal(r1.status, 200);
  const t2 = await r1.json();
  assert.notEqual(t2.refresh_token, tokens.refresh_token);
  assert.equal((await refresh(tokens.refresh_token)).status, 400);
  assert.equal((await mcp(t2.access_token, "tools/list", {})).status, 200);
});

test("token issued for another resource is rejected; hub-wide token accepted", async () => {
  const { tokens: other } = await mcpLogin({ resource: `${hub.url}/metabase` });
  assert.equal((await mcp(other.access_token, "tools/list", {})).status, 401);
  const { tokens: wide } = await mcpLogin({ resource: null });
  assert.equal((await mcp(wide.access_token, "tools/list", {})).status, 200);
});

test("interop: official MCP SDK client (Streamable HTTP) can initialize, list and call tools", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const { tokens } = await mcpLogin();
  const client = new Client({ name: "interop-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${hub.url}/atlassian`), {
    requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } },
  }));
  const { tools } = await client.listTools();
  assert.ok(tools.find((t) => t.name === "jira_search").annotations.readOnlyHint);
  const r = await client.callTool({ name: "jira_search", arguments: { jql: "project = FIN", maxResults: 5 } });
  assert.match(r.content[0].text, /FIN-1/);
  await client.close();
});
