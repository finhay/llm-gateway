#!/usr/bin/env node

// Postinstall: warm-up SQLite deps into ~/.llm-gateway/runtime so the first
// `llm-gateway` start doesn't need network. Failure here is non-fatal —
// cli.js will retry at runtime if anything is missing.
const { ensureSqliteRuntime } = require("./sqliteRuntime");
const { ensureTrayRuntime } = require("./trayRuntime");

try {
  ensureSqliteRuntime({ silent: false });
  console.log("[llm-gateway] runtime SQLite deps ready");
} catch (e) {
  console.warn(`[llm-gateway] runtime warm-up skipped: ${e.message}`);
}

try {
  ensureTrayRuntime({ silent: false });
} catch (e) {
  console.warn(`[llm-gateway] tray runtime skipped: ${e.message}`);
}

process.exit(0);
