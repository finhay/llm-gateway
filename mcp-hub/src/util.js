import crypto from "node:crypto";

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("base64url");
export const nowSec = () => Math.floor(Date.now() / 1000);

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function page(title, body) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1a1a1a}
.card{border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}
button{padding:8px 16px;border-radius:6px;border:0;background:#0b5cff;color:#fff;cursor:pointer}
button.secondary{background:#eee;color:#333}input{width:100%;padding:8px;margin:8px 0;box-sizing:border-box}
.muted{color:#666;font-size:14px}.ok{color:#0a7d32}.warn{color:#b35c00}code{background:#f4f4f4;padding:2px 4px}</style>
</head><body>${body}</body></html>`;
}

// Audit log: one JSON line per event on stdout. Never include secrets or tool payloads.
export function audit(event) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...event, kind: "audit" }) + "\n");
}
