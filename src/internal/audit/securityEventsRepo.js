import { randomUUID, createHash } from "node:crypto";
import { getAdapter } from "@/lib/db/driver.js";

function fingerprint(rawValue) {
  return createHash("sha256").update(String(rawValue)).digest("hex").slice(0, 16);
}

function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    timestamp: row.timestamp,
    requestId: row.requestId,
    apiKey: row.apiKey,
    model: row.model,
    provider: row.provider,
    kind: row.kind,
    type: row.type,
    severity: row.severity,
    classification: row.classification,
    location: row.location,
    fingerprint: row.fingerprint,
    action: row.action,
    ruleId: row.ruleId,
  };
}

export async function recordSecurityEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return 0;
  const db = await getAdapter();
  const now = new Date().toISOString();
  let inserted = 0;
  db.transaction(() => {
    for (const e of events) {
      if (!e.kind || !e.type || !e.location || !e.action) continue;
      db.run(
        `INSERT INTO securityEvents(id, timestamp, requestId, apiKey, model, provider, kind, type, severity, classification, location, fingerprint, action, ruleId)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id || randomUUID(),
          e.timestamp || now,
          e.requestId || null,
          e.apiKey || null,
          e.model || null,
          e.provider || null,
          e.kind,
          e.type,
          e.severity || "normal",
          e.classification || null,
          e.location,
          e.fingerprint || fingerprint(e.rawValue || `${e.type}:${e.location}`),
          e.action,
          e.ruleId || null,
        ]
      );
      inserted++;
    }
  });
  return inserted;
}

export async function getSecurityEvents(filter = {}) {
  const db = await getAdapter();
  const conds = [];
  const params = [];
  if (filter.kind) { conds.push("kind = ?"); params.push(filter.kind); }
  if (filter.type) { conds.push("type = ?"); params.push(filter.type); }
  if (filter.action) { conds.push("action = ?"); params.push(filter.action); }
  if (filter.apiKey) { conds.push("apiKey = ?"); params.push(filter.apiKey); }
  if (filter.since) { conds.push("timestamp >= ?"); params.push(new Date(filter.since).toISOString()); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const limit = Math.min(Math.max(parseInt(filter.limit, 10) || 200, 1), 1000);
  const rows = db.all(
    `SELECT * FROM securityEvents ${where} ORDER BY timestamp DESC LIMIT ?`,
    [...params, limit]
  );
  return rows.map(rowToEvent);
}

export async function getSecurityEventStats(sinceMs = 7 * 86400000) {
  const db = await getAdapter();
  const cutoff = new Date(Date.now() - sinceMs).toISOString();
  const rows = db.all(
    `SELECT kind, type, action, classification, COUNT(*) as count
     FROM securityEvents WHERE timestamp >= ?
     GROUP BY kind, type, action, classification`,
    [cutoff]
  );
  const byKind = {};
  const byType = {};
  const byAction = {};
  const byClassification = {};
  let total = 0;
  for (const r of rows) {
    const c = Number(r.count) || 0;
    total += c;
    byKind[r.kind] = (byKind[r.kind] || 0) + c;
    byType[r.type] = (byType[r.type] || 0) + c;
    byAction[r.action] = (byAction[r.action] || 0) + c;
    if (r.classification) byClassification[r.classification] = (byClassification[r.classification] || 0) + c;
  }
  return { total, byKind, byType, byAction, byClassification };
}

export { fingerprint };
