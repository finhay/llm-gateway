// Express app: OAuth AS + per-service MCP endpoints + connections portal.
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createOAuthProvider } from "./oauth.js";
import { createGoogle } from "./google.js";
import { createVault } from "./vault.js";
import { atlassianService } from "./services/atlassian.js";
import { redact } from "./redact.js";
import { escapeHtml, page, audit } from "./util.js";

const ALL_SERVICES = [atlassianService];

function parseCookies(req, _res, next) {
  req.cookies = Object.fromEntries((req.headers.cookie || "").split(";").map((p) => p.trim()).filter(Boolean)
    .map((p) => { const i = p.indexOf("="); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));
  next();
}

export function createApp({ cfg, store, fetchImpl = fetch, version = "0.1.0" }) {
  const google = createGoogle(cfg.google, { fetchImpl });
  const vault = createVault(cfg.vaultKey);
  const oauth = createOAuthProvider({ cfg, store, google });
  const services = ALL_SERVICES.filter((s) => cfg.services[s.id]);
  const issuerUrl = new URL(cfg.publicUrl);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(parseCookies);
  app.use(["/oauth/consent", "/connections"], express.urlencoded({ extended: false, limit: "16kb" }));

  app.get("/healthz", (_req, res) => res.json({ ok: true, version, services: services.map((s) => s.id) }));

  // Standard MCP authorization endpoints: AS metadata, /authorize, /token, /register, /revoke.
  app.use(mcpAuthRouter({
    provider: oauth.provider,
    issuerUrl,
    scopesSupported: ["mcp"],
    resourceName: "Finhay MCP Hub",
  }));
  oauth.mountRoutes(app);

  const notConnected = (svc) => ({
    isError: true,
    content: [{ type: "text", text:
      `Bạn chưa kết nối ${svc.title} (hoặc credential đã hết hạn). ` +
      `Mở ${cfg.publicUrl}/connections/${svc.id} để kết nối, rồi hỏi lại. ` +
      `Không dán token/mật khẩu vào cuộc chat.` }],
  });

  for (const svc of services) {
    const resourceUrl = `${cfg.publicUrl}/${svc.id}`;
    const metadataPath = `/.well-known/oauth-protected-resource/${svc.id}`;

    // RFC 9728 protected resource metadata per endpoint.
    app.get(metadataPath, (_req, res) => res.json({
      resource: resourceUrl,
      authorization_servers: [cfg.publicUrl],
      scopes_supported: ["mcp"],
      resource_name: `Finhay MCP Hub – ${svc.title}`,
    }));

    const bearer = requireBearerAuth({
      verifier: oauth.provider,
      requiredScopes: ["mcp"],
      resourceMetadataUrl: `${cfg.publicUrl}${metadataPath}`,
    });
    // Audience: token must be for this endpoint, or hub-wide (client sent no `resource`).
    const audience = (req, res, next) => {
      const aud = req.auth?.resource?.href.replace(/\/$/, "");
      if (aud === resourceUrl || aud === cfg.publicUrl) return next();
      res.status(401).set("WWW-Authenticate", `Bearer error="invalid_token", resource_metadata="${cfg.publicUrl}${metadataPath}"`)
        .json({ error: "invalid_token", error_description: "Token audience does not match this MCP endpoint" });
    };

    app.post(`/${svc.id}`, express.json({ limit: "1mb" }), bearer, audience, async (req, res) => {
      const email = req.auth.extra.email;
      const server = new McpServer({ name: `finhay-${svc.id}`, version });

      const getCredential = async () => {
        const row = store.connections.get(email, svc.id);
        if (!row) { const e = new Error("not connected"); e.code = "NOT_CONNECTED"; throw e; }
        return vault.decrypt(email, svc.id, row.enc);
      };
      // Wrap every tool: audit, redaction, uniform error mapping.
      const run = (tool, fn) => async (args) => {
        const started = Date.now();
        try {
          const result = await fn(args);
          audit({ event: "tool.call", email, service: svc.id, tool, ok: true, ms: Date.now() - started });
          return { content: [{ type: "text", text: redact(JSON.stringify(result, null, 2)) }] };
        } catch (err) {
          audit({ event: "tool.call", email, service: svc.id, tool, ok: false, error: err.code || "ERROR", ms: Date.now() - started });
          if (err.code === "NOT_CONNECTED" || err.code === "AUTH") return notConnected(svc);
          return { isError: true, content: [{ type: "text", text: `Lỗi khi gọi ${svc.title}: ${err.message}` }] };
        }
      };
      svc.registerTools(server, { svcCfg: cfg.services[svc.id], getCredential, fetchImpl, run });

      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
    // Stateless server: no SSE stream / session termination.
    app.all(`/${svc.id}`, (_req, res) => res.status(405).set("Allow", "POST").json({ error: "method_not_allowed" }));
  }

  // ---------------- Connections portal ----------------
  const requireSession = async (req, res, next) => {
    const s = await oauth.readSession(req);
    if (!s) return oauth.startPortalLogin(res, req.originalUrl.startsWith("/connections") ? req.originalUrl : "/connections");
    req.session = s;
    next();
  };
  const checkCsrf = (req, res, next) =>
    req.body?.csrf === req.session.csrf ? next() : res.status(403).type("html").send(page("Lỗi", "<p>CSRF token không hợp lệ.</p>"));

  app.get("/connections", requireSession, (req, res) => {
    const rows = services.map((svc) => {
      const c = svc.credentialMode === "user" ? store.connections.get(req.session.email, svc.id) : null;
      const status = svc.credentialMode !== "user" ? `<span class="ok">✅ Không cần kết nối</span>`
        : c ? `<span class="ok">✅ Đã kết nối${c.meta.displayName ? ` (${escapeHtml(c.meta.displayName)})` : ""}</span>`
          : `<span class="warn">⚪ Chưa kết nối</span>`;
      return `<div class="card"><b>${escapeHtml(svc.title)}</b><br>${status}<br>
        <span class="muted">MCP URL: <code>${escapeHtml(`${cfg.publicUrl}/${svc.id}`)}</code></span><br>
        ${svc.credentialMode === "user" ? `<a href="/connections/${svc.id}">${c ? "Cập nhật" : "Kết nối"}</a>` : ""}</div>`;
    }).join("");
    res.type("html").send(page("Kết nối của tôi", `<h2>Kết nối của tôi</h2>
      <p class="muted">Đăng nhập: ${escapeHtml(req.session.email)}</p>${rows}`));
  });

  for (const svc of services.filter((s) => s.credentialMode === "user")) {
    app.get(`/connections/${svc.id}`, requireSession, (req, res) => {
      const c = store.connections.get(req.session.email, svc.id);
      res.type("html").send(page(`Kết nối ${svc.title}`, `<h2>Kết nối ${escapeHtml(svc.title)}</h2>
        <p class="muted">${escapeHtml(svc.connectHelp)}</p>
        <form method="post" action="/connections/${svc.id}">
          <input type="hidden" name="csrf" value="${escapeHtml(req.session.csrf)}">
          <label>Personal Access Token<input type="password" name="credential" autocomplete="off" required></label>
          <button type="submit">Lưu và kiểm tra</button>
        </form>
        ${c ? `<form method="post" action="/connections/${svc.id}/delete" style="margin-top:12px">
          <input type="hidden" name="csrf" value="${escapeHtml(req.session.csrf)}">
          <button class="secondary" type="submit">Ngắt kết nối</button></form>` : ""}
        <p><a href="/connections">← Quay lại</a></p>`));
    });

    app.post(`/connections/${svc.id}`, requireSession, checkCsrf, async (req, res) => {
      const credential = String(req.body?.credential || "").trim();
      let meta;
      try {
        meta = await svc.validateCredential(cfg.services[svc.id], credential, fetchImpl);
      } catch {
        audit({ event: "connection.invalid", email: req.session.email, service: svc.id });
        return res.status(400).type("html").send(page("Không hợp lệ", `<p>${escapeHtml(svc.title)} từ chối credential này.</p><p><a href="/connections/${svc.id}">Thử lại</a></p>`));
      }
      store.connections.upsert(req.session.email, svc.id, vault.encrypt(req.session.email, svc.id, credential), meta);
      audit({ event: "connection.saved", email: req.session.email, service: svc.id });
      res.redirect(303, "/connections");
    });

    app.post(`/connections/${svc.id}/delete`, requireSession, checkCsrf, (req, res) => {
      store.connections.remove(req.session.email, svc.id);
      audit({ event: "connection.removed", email: req.session.email, service: svc.id });
      res.redirect(303, "/connections");
    });
  }

  return app;
}
