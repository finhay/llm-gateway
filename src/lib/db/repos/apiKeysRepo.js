import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const HASH_SECRET = process.env.API_KEY_HASH_SECRET || process.env.API_KEY_SECRET || "endpoint-proxy-api-key-secret";
const DEFAULT_SCOPES = ["*"];

export const API_KEY_SCOPES = Object.freeze({
  ALL: "*",
  CHAT_WRITE: "chat:write",
  EMBEDDINGS_WRITE: "embeddings:write",
  IMAGES_WRITE: "images:write",
  TTS_WRITE: "tts:write",
  STT_WRITE: "stt:write",
  SEARCH_WRITE: "search:write",
  FETCH_WRITE: "fetch:write",
  MODELS_READ: "models:read",
  TOKENS_COUNT: "tokens:count",
  CLOUD_SYNC: "cloud:sync",
  KEYS_READ: "keys:read",
  KEYS_WRITE: "keys:write",
  ADMIN: "admin:*",
});

export function hashApiKey(key) {
  return crypto.createHmac("sha256", HASH_SECRET).update(String(key || "")).digest("hex");
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return DEFAULT_SCOPES;
  const normalized = scopes.filter((scope) => typeof scope === "string" && scope.trim()).map((scope) => scope.trim());
  return normalized.length ? [...new Set(normalized)] : DEFAULT_SCOPES;
}

function normalizeStatus(row) {
  if (row.status) return row.status;
  return row.isActive === 0 || row.isActive === false ? "revoked" : "active";
}

function rowToKey(row, { includeSecrets = false } = {}) {
  if (!row) return null;
  const status = normalizeStatus(row);
  const key = {
    id: row.id,
    name: row.name,
    machineId: row.machineId,
    keyPrefix: row.keyPrefix || (row.key ? row.key.slice(0, 12) : ""),
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    scopes: normalizeScopes(parseJson(row.scopes, DEFAULT_SCOPES)),
    status,
    isActive: status === "active" && row.isActive !== 0 && row.revokedAt == null,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    lastRotatedAt: row.lastRotatedAt,
    rotatedFromKeyId: row.rotatedFromKeyId,
    revokedAt: row.revokedAt,
    revokedBy: row.revokedBy,
    revokeReason: row.revokeReason,
    rateLimitRpm: row.rateLimitRpm,
    rateLimitRpd: row.rateLimitRpd,
    budgetLimitUsd: row.budgetLimitUsd,
    budgetPeriod: row.budgetPeriod,
    budgetSpentUsd: Number(row.budgetSpentUsd || 0),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.createdAt,
  };
  if (includeSecrets) {
    key.key = row.key;
    key.keyHash = row.keyHash;
  }
  return key;
}

function keyToDbFields(data = {}) {
  const fields = {};
  if ("name" in data) fields.name = data.name || null;
  if ("machineId" in data) fields.machineId = data.machineId || null;
  if ("ownerType" in data) fields.ownerType = data.ownerType || null;
  if ("ownerId" in data) fields.ownerId = data.ownerId || null;
  if ("scopes" in data) fields.scopes = stringifyJson(normalizeScopes(data.scopes));
  if ("status" in data) fields.status = data.status || "active";
  if ("isActive" in data) {
    fields.isActive = data.isActive === false ? 0 : 1;
    fields.status = data.isActive === false ? "revoked" : "active";
  }
  if ("expiresAt" in data) fields.expiresAt = data.expiresAt || null;
  if ("rateLimitRpm" in data) fields.rateLimitRpm = data.rateLimitRpm == null ? null : Number(data.rateLimitRpm);
  if ("rateLimitRpd" in data) fields.rateLimitRpd = data.rateLimitRpd == null ? null : Number(data.rateLimitRpd);
  if ("budgetLimitUsd" in data) fields.budgetLimitUsd = data.budgetLimitUsd == null ? null : Number(data.budgetLimitUsd);
  if ("budgetPeriod" in data) fields.budgetPeriod = data.budgetPeriod || null;
  if ("createdBy" in data) fields.createdBy = data.createdBy || null;
  if ("updatedBy" in data) fields.updatedBy = data.updatedBy || null;
  if ("metadata" in data) fields.metadata = stringifyJson(data.metadata || {});
  return fields;
}

function hasExpired(row) {
  return row.expiresAt && Number.isFinite(Date.parse(row.expiresAt)) && Date.parse(row.expiresAt) <= Date.now();
}

function legacyKeyPlaceholder(id) {
  return `stored-hash:${id}`;
}

function insertAdminEvent(db, event) {
  db.run(
    `INSERT INTO apiKeyAdminEvents(id, timestamp, apiKeyId, keyPrefix, actorType, actorId, action, beforeJson, afterJson, reason, metadata)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id || uuidv4(),
      event.timestamp || new Date().toISOString(),
      event.apiKeyId || null,
      event.keyPrefix || null,
      event.actorType || null,
      event.actorId || null,
      event.action,
      event.beforeJson ? stringifyJson(event.beforeJson) : null,
      event.afterJson ? stringifyJson(event.afterJson) : null,
      event.reason || null,
      stringifyJson(event.metadata || {}),
    ]
  );
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getSafeApiKeys() {
  return getApiKeys();
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, options = {}) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const now = new Date().toISOString();
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    keyHash: hashApiKey(result.key),
    keyPrefix: result.key.slice(0, 12),
    machineId,
    ownerType: options.ownerType || null,
    ownerId: options.ownerId || null,
    scopes: normalizeScopes(options.scopes),
    status: "active",
    isActive: true,
    expiresAt: options.expiresAt || null,
    rateLimitRpm: options.rateLimitRpm == null ? null : Number(options.rateLimitRpm),
    rateLimitRpd: options.rateLimitRpd == null ? null : Number(options.rateLimitRpd),
    budgetLimitUsd: options.budgetLimitUsd == null ? null : Number(options.budgetLimitUsd),
    budgetPeriod: options.budgetPeriod || null,
    budgetSpentUsd: 0,
    createdBy: options.createdBy || null,
    updatedAt: now,
    updatedBy: options.createdBy || null,
    metadata: options.metadata || {},
    createdAt: now,
  };

  db.transaction(() => {
    db.run(
      `INSERT INTO apiKeys(id, key, keyHash, keyPrefix, name, machineId, ownerType, ownerId, scopes, status, isActive, expiresAt, rateLimitRpm, rateLimitRpd, budgetLimitUsd, budgetPeriod, budgetSpentUsd, createdBy, updatedAt, updatedBy, metadata, createdAt)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        apiKey.id,
        legacyKeyPlaceholder(apiKey.id),
        apiKey.keyHash,
        apiKey.keyPrefix,
        apiKey.name,
        apiKey.machineId,
        apiKey.ownerType,
        apiKey.ownerId,
        stringifyJson(apiKey.scopes),
        apiKey.status,
        1,
        apiKey.expiresAt,
        apiKey.rateLimitRpm,
        apiKey.rateLimitRpd,
        apiKey.budgetLimitUsd,
        apiKey.budgetPeriod,
        apiKey.budgetSpentUsd,
        apiKey.createdBy,
        apiKey.updatedAt,
        apiKey.updatedBy,
        stringifyJson(apiKey.metadata),
        apiKey.createdAt,
      ]
    );
    insertAdminEvent(db, {
      apiKeyId: apiKey.id,
      keyPrefix: apiKey.keyPrefix,
      actorType: options.actorType || null,
      actorId: options.createdBy || null,
      action: "created",
      afterJson: { ...apiKey, key: undefined, keyHash: undefined },
    });
  });

  return { ...rowToKey(apiKey), key: apiKey.key };
}

export async function updateApiKey(id, data = {}) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const before = rowToKey(row);
    const fields = keyToDbFields(data);
    fields.updatedAt = new Date().toISOString();
    if (data.updatedBy) fields.updatedBy = data.updatedBy;
    const entries = Object.entries(fields);
    if (entries.length) {
      db.run(
        `UPDATE apiKeys SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`,
        [...entries.map(([, value]) => value), id]
      );
    }
    const updated = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    result = rowToKey(updated);
    insertAdminEvent(db, {
      apiKeyId: id,
      keyPrefix: result.keyPrefix,
      actorType: data.actorType || null,
      actorId: data.updatedBy || null,
      action: data.isActive === false || data.status === "revoked" ? "revoked" : "updated",
      beforeJson: before,
      afterJson: result,
      reason: data.revokeReason || null,
    });
  });
  return result;
}

export async function revokeApiKey(id, actor = {}, reason = null) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const before = rowToKey(row);
    const now = new Date().toISOString();
    db.run(
      `UPDATE apiKeys SET status = 'revoked', isActive = 0, revokedAt = ?, revokedBy = ?, revokeReason = ?, updatedAt = ?, updatedBy = ? WHERE id = ?`,
      [now, actor.id || null, reason || null, now, actor.id || null, id]
    );
    result = rowToKey(db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]));
    insertAdminEvent(db, {
      apiKeyId: id,
      keyPrefix: result.keyPrefix,
      actorType: actor.type || null,
      actorId: actor.id || null,
      action: "revoked",
      beforeJson: before,
      afterJson: result,
      reason,
    });
  });
  return result;
}

export async function rotateApiKey(id, actor = {}) {
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const before = rowToKey(row);
    const machineId = row.machineId;
    const generated = generateApiKeyWithMachine(machineId);
    const now = new Date().toISOString();
    db.run(
      `UPDATE apiKeys SET key = ?, keyHash = ?, keyPrefix = ?, status = 'active', isActive = 1, lastRotatedAt = ?, revokedAt = NULL, revokedBy = NULL, revokeReason = NULL, updatedAt = ?, updatedBy = ? WHERE id = ?`,
      [legacyKeyPlaceholder(id), hashApiKey(generated.key), generated.key.slice(0, 12), now, now, actor.id || null, id]
    );
    result = rowToKey(db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]));
    insertAdminEvent(db, {
      apiKeyId: id,
      keyPrefix: result.keyPrefix,
      actorType: actor.type || null,
      actorId: actor.id || null,
      action: "rotated",
      beforeJson: before,
      afterJson: result,
    });
    result.key = generated.key;
  });
  return result;
}

export async function deleteApiKey(id) {
  return Boolean(await revokeApiKey(id, { type: "system", id: null }, "deleted"));
}

export async function updateApiKeyLastUsed(id) {
  const db = await getAdapter();
  db.run(`UPDATE apiKeys SET lastUsedAt = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

export async function incrementApiKeyBudgetSpent(id, deltaUsd = 0) {
  const amount = Number(deltaUsd || 0);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const db = await getAdapter();
  db.run(`UPDATE apiKeys SET budgetSpentUsd = COALESCE(budgetSpentUsd, 0) + ? WHERE id = ?`, [amount, id]);
}

export async function validateApiKey(key) {
  if (!key) return null;
  const db = await getAdapter();
  const keyHash = hashApiKey(key);
  let row = db.get(`SELECT * FROM apiKeys WHERE keyHash = ?`, [keyHash]);
  if (!row) row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return null;
  const record = rowToKey(row);
  if (!record.isActive || record.status !== "active" || record.revokedAt || hasExpired(record)) return null;
  return record;
}

export async function recordApiKeyUsageEvent(event = {}) {
  const db = await getAdapter();
  db.run(
    `INSERT INTO apiKeyUsageEvents(id, timestamp, apiKeyId, keyPrefix, route, method, provider, model, scopeUsed, inputTokens, outputTokens, costUsd, statusCode, errorCode, requestId, ipHash, userAgentHash, metadata)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id || uuidv4(),
      event.timestamp || new Date().toISOString(),
      event.apiKeyId || null,
      event.keyPrefix || null,
      event.route || null,
      event.method || null,
      event.provider || null,
      event.model || null,
      event.scopeUsed || null,
      event.inputTokens || 0,
      event.outputTokens || 0,
      event.costUsd || 0,
      event.statusCode || null,
      event.errorCode || null,
      event.requestId || null,
      event.ipHash || null,
      event.userAgentHash || null,
      stringifyJson(event.metadata || {}),
    ]
  );
}

export async function getApiKeyUsageEvents(apiKeyId, limit = 100) {
  const db = await getAdapter();
  return db.all(`SELECT * FROM apiKeyUsageEvents WHERE apiKeyId = ? ORDER BY timestamp DESC LIMIT ?`, [apiKeyId, Math.min(Math.max(Number(limit) || 100, 1), 1000)]);
}

export async function getApiKeyAdminEvents(apiKeyId, limit = 100) {
  const db = await getAdapter();
  return db.all(`SELECT * FROM apiKeyAdminEvents WHERE apiKeyId = ? ORDER BY timestamp DESC LIMIT ?`, [apiKeyId, Math.min(Math.max(Number(limit) || 100, 1), 1000)]).map((row) => ({
    ...row,
    beforeJson: parseJson(row.beforeJson, null),
    afterJson: parseJson(row.afterJson, null),
    metadata: parseJson(row.metadata, {}),
  }));
}
