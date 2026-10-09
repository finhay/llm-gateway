// SQLite persistence (node:sqlite, no native build). One file under DATA_DIR.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY, info TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pending_auth (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS connections (
  email TEXT NOT NULL, service TEXT NOT NULL, ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL, tag BLOB NOT NULL, meta TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (email, service));
`;

const now = () => Math.floor(Date.now() / 1000);

export function openStore(dataDir) {
  const file = dataDir === ":memory:" ? ":memory:" : path.join(dataDir, "mcp-hub.sqlite");
  if (file !== ":memory:") fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  // Generic one-shot key/value with expiry (pending auth, codes, refresh tokens).
  const kv = (table, key) => ({
    put(id, data, ttlSec) {
      db.prepare(`INSERT OR REPLACE INTO ${table} (${key}, data, expires_at) VALUES (?, ?, ?)`)
        .run(id, JSON.stringify(data), now() + ttlSec);
    },
    putUntil(id, data, expiresAt) {
      db.prepare(`INSERT OR REPLACE INTO ${table} (${key}, data, expires_at) VALUES (?, ?, ?)`)
        .run(id, JSON.stringify(data), expiresAt);
    },
    get(id) {
      const row = db.prepare(`SELECT data, expires_at FROM ${table} WHERE ${key} = ?`).get(id);
      if (!row || row.expires_at < now()) return null;
      return JSON.parse(row.data);
    },
    // Atomically read-and-delete: codes and refresh tokens are single use.
    take(id) {
      const row = db.prepare(`DELETE FROM ${table} WHERE ${key} = ? RETURNING data, expires_at`).get(id);
      if (!row || row.expires_at < now()) return null;
      return JSON.parse(row.data);
    },
    del(id) { db.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(id); },
  });

  return {
    db,
    pending: kv("pending_auth", "id"),
    codes: kv("auth_codes", "code_hash"),
    refresh: kv("refresh_tokens", "token_hash"),
    clients: {
      get(clientId) {
        const row = db.prepare("SELECT info FROM oauth_clients WHERE client_id = ?").get(clientId);
        return row ? JSON.parse(row.info) : undefined;
      },
      put(info) {
        db.prepare("INSERT OR REPLACE INTO oauth_clients (client_id, info, created_at) VALUES (?, ?, ?)")
          .run(info.client_id, JSON.stringify(info), now());
        return info;
      },
    },
    connections: {
      upsert(email, service, enc, meta) {
        db.prepare(`INSERT OR REPLACE INTO connections
          (email, service, ciphertext, iv, tag, meta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(email, service, enc.ciphertext, enc.iv, enc.tag, JSON.stringify(meta || {}), now());
      },
      get(email, service) {
        const row = db.prepare("SELECT * FROM connections WHERE email = ? AND service = ?").get(email, service);
        if (!row) return null;
        return {
          enc: { ciphertext: Buffer.from(row.ciphertext), iv: Buffer.from(row.iv), tag: Buffer.from(row.tag) },
          meta: JSON.parse(row.meta || "{}"),
          updatedAt: row.updated_at,
        };
      },
      remove(email, service) {
        db.prepare("DELETE FROM connections WHERE email = ? AND service = ?").run(email, service);
      },
      removeAllFor(email) {
        db.prepare("DELETE FROM connections WHERE email = ?").run(email);
      },
    },
    purgeExpired() {
      for (const t of ["pending_auth", "auth_codes", "refresh_tokens"]) {
        db.prepare(`DELETE FROM ${t} WHERE expires_at < ?`).run(now());
      }
    },
    close() { db.close(); },
  };
}
