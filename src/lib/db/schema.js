// Latest schema version — bumped when a migration is added in ./migrations/
export const SCHEMA_VERSION = 2;

export const PRAGMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

// Declarative current schema. Used by syncSchemaFromTables() to
// auto-add missing tables/columns/indexes after versioned migrations.
// For destructive changes (drop/rename/type-change), write a migration file.
export const TABLES = {
  _meta: {
    columns: {
      key: "TEXT PRIMARY KEY",
      value: "TEXT NOT NULL",
    },
  },
  settings: {
    columns: {
      id: "INTEGER PRIMARY KEY CHECK (id = 1)",
      data: "TEXT NOT NULL",
    },
  },
  providerConnections: {
    columns: {
      id: "TEXT PRIMARY KEY",
      provider: "TEXT NOT NULL",
      authType: "TEXT NOT NULL",
      name: "TEXT",
      email: "TEXT",
      priority: "INTEGER",
      isActive: "INTEGER DEFAULT 1",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pc_provider ON providerConnections(provider)",
      "CREATE INDEX IF NOT EXISTS idx_pc_provider_active ON providerConnections(provider, isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pc_priority ON providerConnections(provider, priority)",
    ],
  },
  providerNodes: {
    columns: {
      id: "TEXT PRIMARY KEY",
      type: "TEXT",
      name: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: ["CREATE INDEX IF NOT EXISTS idx_pn_type ON providerNodes(type)"],
  },
  proxyPools: {
    columns: {
      id: "TEXT PRIMARY KEY",
      isActive: "INTEGER DEFAULT 1",
      testStatus: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pp_active ON proxyPools(isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pp_status ON proxyPools(testStatus)",
    ],
  },
  apiKeys: {
    columns: {
      id: "TEXT PRIMARY KEY",
      key: "TEXT UNIQUE",
      keyHash: "TEXT UNIQUE",
      keyPrefix: "TEXT NOT NULL DEFAULT ''",
      name: "TEXT",
      machineId: "TEXT",
      ownerType: "TEXT",
      ownerId: "TEXT",
      scopes: "TEXT NOT NULL DEFAULT '[]'",
      status: "TEXT NOT NULL DEFAULT 'active'",
      isActive: "INTEGER DEFAULT 1",
      expiresAt: "TEXT",
      lastUsedAt: "TEXT",
      lastRotatedAt: "TEXT",
      rotatedFromKeyId: "TEXT",
      revokedAt: "TEXT",
      revokedBy: "TEXT",
      revokeReason: "TEXT",
      rateLimitRpm: "INTEGER",
      rateLimitRpd: "INTEGER",
      budgetLimitUsd: "REAL",
      budgetPeriod: "TEXT",
      budgetSpentUsd: "REAL NOT NULL DEFAULT 0",
      createdBy: "TEXT",
      updatedAt: "TEXT",
      updatedBy: "TEXT",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_ak_key ON apiKeys(key)",
      "CREATE INDEX IF NOT EXISTS idx_ak_hash ON apiKeys(keyHash)",
      "CREATE INDEX IF NOT EXISTS idx_ak_status ON apiKeys(status)",
      "CREATE INDEX IF NOT EXISTS idx_ak_owner ON apiKeys(ownerType, ownerId)",
      "CREATE INDEX IF NOT EXISTS idx_ak_last_used ON apiKeys(lastUsedAt)",
    ],
  },
  combos: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT UNIQUE NOT NULL",
      kind: "TEXT",
      models: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: ["CREATE INDEX IF NOT EXISTS idx_combo_name ON combos(name)"],
  },
  kv: {
    columns: {
      scope: "TEXT NOT NULL",
      key: "TEXT NOT NULL",
      value: "TEXT NOT NULL",
    },
    primaryKey: "PRIMARY KEY (scope, key)",
    indexes: ["CREATE INDEX IF NOT EXISTS idx_kv_scope ON kv(scope)"],
  },
  usageHistory: {
    columns: {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      apiKey: "TEXT",
      apiKeyId: "TEXT",
      endpoint: "TEXT",
      promptTokens: "INTEGER DEFAULT 0",
      completionTokens: "INTEGER DEFAULT 0",
      cost: "REAL DEFAULT 0",
      status: "TEXT",
      tokens: "TEXT",
      meta: "TEXT",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_uh_ts ON usageHistory(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_uh_provider ON usageHistory(provider)",
      "CREATE INDEX IF NOT EXISTS idx_uh_model ON usageHistory(model)",
      "CREATE INDEX IF NOT EXISTS idx_uh_conn ON usageHistory(connectionId)",
      "CREATE INDEX IF NOT EXISTS idx_uh_api_key_id ON usageHistory(apiKeyId)",
    ],
  },
  usageDaily: {
    columns: {
      dateKey: "TEXT PRIMARY KEY",
      data: "TEXT NOT NULL",
    },
  },
  requestDetails: {
    columns: {
      id: "TEXT PRIMARY KEY",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      apiKeyId: "TEXT",
      apiKeyPrefix: "TEXT",
      status: "TEXT",
      data: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_rd_ts ON requestDetails(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_rd_provider ON requestDetails(provider)",
      "CREATE INDEX IF NOT EXISTS idx_rd_model ON requestDetails(model)",
      "CREATE INDEX IF NOT EXISTS idx_rd_conn ON requestDetails(connectionId)",
      "CREATE INDEX IF NOT EXISTS idx_rd_api_key ON requestDetails(apiKeyId)",
    ],
  },
  securityEvents: {
    columns: {
      id: "TEXT PRIMARY KEY",
      timestamp: "TEXT NOT NULL",
      requestId: "TEXT",
      apiKey: "TEXT",
      model: "TEXT",
      provider: "TEXT",
      kind: "TEXT NOT NULL",
      type: "TEXT NOT NULL",
      severity: "TEXT NOT NULL",
      classification: "TEXT",
      location: "TEXT NOT NULL",
      fingerprint: "TEXT NOT NULL",
      action: "TEXT NOT NULL",
      ruleId: "TEXT",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_sec_ts ON securityEvents(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_sec_kind ON securityEvents(kind, type)",
      "CREATE INDEX IF NOT EXISTS idx_sec_action ON securityEvents(action)",
    ],
  },
  apiKeyUsageEvents: {
    columns: {
      id: "TEXT PRIMARY KEY",
      timestamp: "TEXT NOT NULL",
      apiKeyId: "TEXT",
      keyPrefix: "TEXT",
      route: "TEXT",
      method: "TEXT",
      provider: "TEXT",
      model: "TEXT",
      scopeUsed: "TEXT",
      inputTokens: "INTEGER DEFAULT 0",
      outputTokens: "INTEGER DEFAULT 0",
      costUsd: "REAL DEFAULT 0",
      statusCode: "INTEGER",
      errorCode: "TEXT",
      requestId: "TEXT",
      ipHash: "TEXT",
      userAgentHash: "TEXT",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_akue_ts ON apiKeyUsageEvents(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_akue_key ON apiKeyUsageEvents(apiKeyId)",
      "CREATE INDEX IF NOT EXISTS idx_akue_request ON apiKeyUsageEvents(requestId)",
      "CREATE INDEX IF NOT EXISTS idx_akue_provider_model ON apiKeyUsageEvents(provider, model)",
    ],
  },
  apiKeyAdminEvents: {
    columns: {
      id: "TEXT PRIMARY KEY",
      timestamp: "TEXT NOT NULL",
      apiKeyId: "TEXT",
      keyPrefix: "TEXT",
      actorType: "TEXT",
      actorId: "TEXT",
      action: "TEXT NOT NULL",
      beforeJson: "TEXT",
      afterJson: "TEXT",
      reason: "TEXT",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_akae_ts ON apiKeyAdminEvents(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_akae_key ON apiKeyAdminEvents(apiKeyId)",
      "CREATE INDEX IF NOT EXISTS idx_akae_actor ON apiKeyAdminEvents(actorId)",
      "CREATE INDEX IF NOT EXISTS idx_akae_action ON apiKeyAdminEvents(action)",
    ],
  },
};

export function buildCreateTableSql(name, def) {
  const cols = Object.entries(def.columns).map(([k, v]) => `${k} ${v}`);
  if (def.primaryKey) cols.push(def.primaryKey);
  return `CREATE TABLE IF NOT EXISTS ${name} (${cols.join(", ")})`;
}
