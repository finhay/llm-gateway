# Finhay MCP Hub

Remote MCP endpoints for internal tools, behind Google Workspace login.
Separate runtime from `llm-gateway` (own container, own vault key). Design: [`docs/DESIGN.md`](docs/DESIGN.md).

## What works in this skeleton

- OAuth 2.1 Authorization Server for MCP clients: metadata, Dynamic Client Registration, PKCE, refresh rotation, revoke (MCP SDK router).
- Login federated to Google Workspace; only `MCP_HUB_ALLOWED_DOMAINS` accounts (verified email + `hd` claim).
- Consent screen before Google, bound to the browser (blocks CSRF/phishing via rogue DCR clients).
- Per-endpoint protected resource metadata + audience check (`/atlassian` token ≠ `/metabase` token).
- `/atlassian` endpoint (stateless Streamable HTTP): `jira_search`, `jira_get_issue` with the user's own Jira DC PAT.
- Portal `/connections`: user connects/disconnects PAT; stored AES-256-GCM, AAD-bound to (email, service).
- "Not connected" tool result tells the user where to connect (never asks for secrets in chat).
- Output redaction hook, JSON audit log (no payloads/secrets).

## Run locally

```bash
cp .env.example .env   # fill values
npm ci
node --env-file=.env src/index.js
```

## Test

```bash
npm test   # e2e with fake Google OIDC + fake Jira, plus official MCP SDK client interop
```

## Add to a client

- Claude Code: `claude mcp add --transport http finhay-atlassian https://mcp.finhay.vn/atlassian`
- Cursor / VS Code: add `{"url": "https://mcp.finhay.vn/atlassian"}` under MCP servers
- Claude.ai / ChatGPT: Custom connector → URL `https://mcp.finhay.vn/atlassian`
- stdio-only clients: `npx mcp-remote https://mcp.finhay.vn/atlassian`

First use opens a browser: consent → Google login → done. Connect Jira PAT at `/connections`.
