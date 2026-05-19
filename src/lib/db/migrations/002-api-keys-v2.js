import crypto from "crypto";
import { TABLES, buildCreateTableSql } from "../schema.js";

const HASH_SECRET = process.env.API_KEY_HASH_SECRET || process.env.API_KEY_SECRET || "endpoint-proxy-api-key-secret";

function hashApiKey(key) {
  return crypto.createHmac("sha256", HASH_SECRET).update(key).digest("hex");
}

function keyPrefix(key) {
  return typeof key === "string" ? key.slice(0, 12) : "";
}

function runSql(db, sql) {
  db["exec"](sql);
}

function ensureColumn(db, tableName, columnName, columnDef) {
  const existing = db.all(`PRAGMA table_info(${tableName})`);
  if (existing.some((row) => row.name === columnName)) return;
  const safeDef = columnDef.replace(/PRIMARY KEY( AUTOINCREMENT)?/i, "").replace(/UNIQUE/i, "").trim();
  runSql(db, `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${safeDef}`);
}

function ensureTable(db, tableName) {
  const def = TABLES[tableName];
  runSql(db, buildCreateTableSql(tableName, def));
  for (const idx of def.indexes || []) runSql(db, idx);
}

export default {
  version: 2,
  name: "api-keys-v2",
  up(db) {
    for (const [columnName, columnDef] of Object.entries(TABLES.apiKeys.columns)) {
      ensureColumn(db, "apiKeys", columnName, columnDef);
    }
    ensureColumn(db, "usageHistory", "apiKeyId", TABLES.usageHistory.columns.apiKeyId);
    ensureTable(db, "apiKeyUsageEvents");
    ensureTable(db, "apiKeyAdminEvents");
    for (const idx of TABLES.apiKeys.indexes || []) runSql(db, idx);
    for (const idx of TABLES.usageHistory.indexes || []) runSql(db, idx);

    const rows = db.all(`SELECT id, key, isActive FROM apiKeys WHERE key IS NOT NULL AND (keyHash IS NULL OR keyHash = '')`);
    for (const row of rows) {
      const active = row.isActive === 1 || row.isActive === true;
      db.run(
        `UPDATE apiKeys
         SET keyHash = ?, keyPrefix = ?, status = ?, scopes = ?
         WHERE id = ?`,
        [hashApiKey(row.key), keyPrefix(row.key), active ? "active" : "revoked", '["*"]', row.id]
      );
    }
  },
};
