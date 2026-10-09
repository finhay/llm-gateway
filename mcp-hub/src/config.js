// Runtime configuration. All secrets come from env; never log them.
import path from "node:path";

function required(name, env) {
  const v = env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

export function loadConfig(env = process.env) {
  const publicUrl = required("MCP_HUB_PUBLIC_URL", env).replace(/\/+$/, "");
  const vaultKey = Buffer.from(required("MCP_HUB_VAULT_KEY", env), "base64");
  if (vaultKey.length !== 32) throw new Error("MCP_HUB_VAULT_KEY must be 32 bytes, base64-encoded");
  const jwtSecret = Buffer.from(required("MCP_HUB_JWT_SECRET", env), "utf8");
  if (jwtSecret.length < 32) throw new Error("MCP_HUB_JWT_SECRET must be at least 32 chars");

  return {
    port: Number(env.PORT || 20130),
    publicUrl,
    dataDir: env.DATA_DIR || path.resolve("data"),
    vaultKey,
    jwtSecret,
    accessTokenTtlSec: Number(env.MCP_HUB_ACCESS_TTL_SEC || 3600),
    // Absolute lifetime of a login. Refresh rotation never extends it, so every
    // user re-authenticates with Google at least this often (offboarding bound).
    loginMaxAgeSec: Number(env.MCP_HUB_LOGIN_MAX_AGE_SEC || 7 * 24 * 3600),
    google: {
      issuer: env.GOOGLE_OIDC_ISSUER || "https://accounts.google.com",
      clientId: required("GOOGLE_CLIENT_ID", env),
      clientSecret: required("GOOGLE_CLIENT_SECRET", env),
      allowedDomains: (env.MCP_HUB_ALLOWED_DOMAINS || "finhay.com.vn")
        .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    },
    services: {
      atlassian: env.JIRA_BASE_URL
        ? { jiraBaseUrl: env.JIRA_BASE_URL.replace(/\/+$/, "") }
        : null,
    },
  };
}
