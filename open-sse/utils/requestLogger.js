// Check if running in Node.js environment (has fs module)
const isNode = typeof process !== "undefined" && process.versions?.node && typeof window === "undefined";

// Check if logging is enabled via environment variable (default: false)
const LOGGING_ENABLED = typeof process !== "undefined" && process.env?.ENABLE_REQUEST_LOGS === 'true';

function envNumber(name, fallback, minimum = 0) {
  const value = Number(process.env?.[name]);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

const MB = 1024 * 1024;
const REQUEST_LOG_MAX_TOTAL_BYTES = envNumber("REQUEST_LOG_MAX_TOTAL_MB", 256, 1) * MB;
const REQUEST_LOG_MAX_SESSION_BYTES = envNumber("REQUEST_LOG_MAX_SESSION_MB", 20, 1) * MB;
const REQUEST_LOG_MAX_FILE_BYTES = envNumber("REQUEST_LOG_MAX_FILE_MB", 5, 1) * MB;
const REQUEST_LOG_RETENTION_MS = envNumber("REQUEST_LOG_RETENTION_DAYS", 7, 0) * 24 * 60 * 60 * 1000;
const REQUEST_LOG_PRUNE_INTERVAL_MS = envNumber("REQUEST_LOG_PRUNE_INTERVAL_MS", 60_000, 1_000);

let fs = null;
let path = null;
let LOGS_DIR = null;
let prunePromise = null;
let lastPruneAt = 0;
let trackedTotalBytes = null;

// Lazy load Node.js modules (avoid top-level await)
async function ensureNodeModules() {
  if (!isNode || !LOGGING_ENABLED || fs) return;
  try {
    fs = await import("fs");
    path = await import("path");
    LOGS_DIR = process.env.REQUEST_LOG_DIR
      || path.join(typeof process !== "undefined" && process.cwd ? process.cwd() : ".", "logs");
  } catch {
    // Running in non-Node environment (Worker, Browser, etc.)
  }
}

async function getEntryStats(entryPath) {
  const stat = await fs.promises.lstat(entryPath);
  if (stat.isSymbolicLink()) return { bytes: 0, mtimeMs: stat.mtimeMs };
  if (!stat.isDirectory()) return { bytes: stat.size, mtimeMs: stat.mtimeMs };

  let bytes = 0;
  let mtimeMs = stat.mtimeMs;
  const entries = await fs.promises.readdir(entryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const child = await getEntryStats(path.join(entryPath, entry.name));
    bytes += child.bytes;
    mtimeMs = Math.max(mtimeMs, child.mtimeMs);
  }
  return { bytes, mtimeMs };
}

async function pruneRequestLogs({ force = false } = {}) {
  await ensureNodeModules();
  if (!fs || !LOGS_DIR || !fs.existsSync(LOGS_DIR)) {
    trackedTotalBytes = 0;
    return;
  }

  const now = Date.now();
  if (!force && trackedTotalBytes !== null && now - lastPruneAt < REQUEST_LOG_PRUNE_INTERVAL_MS) return;
  if (prunePromise) return prunePromise;

  lastPruneAt = now;
  prunePromise = (async () => {
    const entries = await fs.promises.readdir(LOGS_DIR, { withFileTypes: true });
    const retained = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(LOGS_DIR, entry.name);
      try {
        const stats = await getEntryStats(fullPath);
        const expired = REQUEST_LOG_RETENTION_MS === 0
          || now - stats.mtimeMs > REQUEST_LOG_RETENTION_MS;
        if (expired) {
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        } else {
          retained.push({ fullPath, ...stats });
        }
      } catch {
        // A concurrent request may still be creating or replacing this entry.
      }
    }

    retained.sort((a, b) => a.mtimeMs - b.mtimeMs);
    let totalBytes = retained.reduce((sum, entry) => sum + entry.bytes, 0);
    // Once the hard limit is reached, free headroom so logging can resume
    // instead of remaining pinned at the exact quota until age expiry.
    const targetBytes = totalBytes >= REQUEST_LOG_MAX_TOTAL_BYTES
      ? Math.floor(REQUEST_LOG_MAX_TOTAL_BYTES * 0.8)
      : REQUEST_LOG_MAX_TOTAL_BYTES;
    for (const entry of retained) {
      if (totalBytes <= targetBytes) break;
      try {
        await fs.promises.rm(entry.fullPath, { recursive: true, force: true });
        totalBytes -= entry.bytes;
      } catch {
        // Keep the bytes accounted for when deletion fails.
      }
    }
    trackedTotalBytes = Math.max(0, totalBytes);
  })().catch((error) => {
    console.log("[LOG] Failed to prune request logs:", error.message);
  }).finally(() => {
    prunePromise = null;
  });

  return prunePromise;
}

// Format timestamp for folder name: 20251228_143045_123
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${y}${m}${d}_${h}${min}${s}_${ms}`;
}

// Create log session folder: {sourceFormat}_{targetFormat}_{model}_{timestamp}
async function createLogSession(sourceFormat, targetFormat, model) {
  await ensureNodeModules();
  if (!fs || !LOGS_DIR) return null;
  
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    await pruneRequestLogs();
    if (trackedTotalBytes >= REQUEST_LOG_MAX_TOTAL_BYTES) return null;
    
    const timestamp = formatTimestamp();
    const safeModel = (model || "unknown").replace(/[/:]/g, "-");
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const folderName = `${sourceFormat}_${targetFormat}_${safeModel}_${timestamp}_${uniqueSuffix}`;
    const sessionPath = path.join(LOGS_DIR, folderName);
    
    fs.mkdirSync(sessionPath, { recursive: true });
    
    return sessionPath;
  } catch (err) {
    console.log("[LOG] Failed to create log session:", err.message);
    return null;
  }
}

function createSessionQuota() {
  return { bytes: 0, files: new Map(), truncated: new Set() };
}

const legacyQuota = createSessionQuota();

function reserveLogBytes(quota, filename, requestedBytes) {
  if (trackedTotalBytes === null) trackedTotalBytes = 0;
  const fileBytes = quota.files.get(filename) || 0;
  const allowed = Math.max(0, Math.min(
    requestedBytes,
    REQUEST_LOG_MAX_FILE_BYTES - fileBytes,
    REQUEST_LOG_MAX_SESSION_BYTES - quota.bytes,
    REQUEST_LOG_MAX_TOTAL_BYTES - trackedTotalBytes,
  ));
  quota.files.set(filename, fileBytes + allowed);
  quota.bytes += allowed;
  trackedTotalBytes += allowed;
  return allowed;
}

function writeBounded(sessionPath, quota, filename, content, { append = false } = {}) {
  if (!fs || !sessionPath) return;
  const input = Buffer.from(String(content));
  const allowed = reserveLogBytes(quota, filename, input.length);
  if (allowed <= 0) return;

  let output = input.subarray(0, allowed);
  if (allowed < input.length && !quota.truncated.has(filename)) {
    quota.truncated.add(filename);
    const marker = Buffer.from("\n[LLM Gateway request log truncated by size limit]\n");
    if (allowed > marker.length) {
      output = Buffer.concat([input.subarray(0, allowed - marker.length), marker]);
    }
  }

  const filePath = path.join(sessionPath, filename);
  if (append) fs.appendFileSync(filePath, output);
  else fs.writeFileSync(filePath, output);
}

// Write JSON file
function writeJsonFile(sessionPath, quota, filename, data) {
  if (!fs || !sessionPath) return;
  
  try {
    const serialized = JSON.stringify(data, null, 2);
    if (Buffer.byteLength(serialized) <= REQUEST_LOG_MAX_FILE_BYTES) {
      writeBounded(sessionPath, quota, filename, serialized);
      return;
    }

    writeBounded(sessionPath, quota, filename, JSON.stringify({
      _truncated: true,
      _originalBytes: Buffer.byteLength(serialized),
      _reason: "REQUEST_LOG_MAX_FILE_MB exceeded",
      preview: serialized.slice(0, 4096),
    }, null, 2));
  } catch (err) {
    console.log(`[LOG] Failed to write ${filename}:`, err.message);
  }
}

// Never persist credentials in debug request logs.
function maskSensitiveHeaders(headers) {
  if (!headers) return {};
  const masked = { ...headers };
  const sensitiveKeys = ["authorization", "x-api-key", "cookie", "token", "api-key"];
  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      masked[key] = "[REDACTED]";
    }
  }
  return masked;
}

// No-op logger when logging is disabled
function createNoOpLogger() {
  return {
    sessionPath: null,
    logClientRawRequest() {},
    logRawRequest() {},
    logOpenAIRequest() {},
    logTargetRequest() {},
    logProviderResponse() {},
    appendProviderChunk() {},
    appendOpenAIChunk() {},
    logConvertedResponse() {},
    appendConvertedChunk() {},
    logError() {}
  };
}

/**
 * Create a new log session and return logger functions
 * @param {string} sourceFormat - Source format from client (claude, openai, etc.)
 * @param {string} targetFormat - Target format to provider (antigravity, gemini-cli, etc.)
 * @param {string} model - Model name
 * @returns {Promise<object>} Promise that resolves to logger object with methods to log each stage
 */
export async function createRequestLogger(sourceFormat, targetFormat, model) {
  // Return no-op logger if logging is disabled
  if (!LOGGING_ENABLED) {
    return createNoOpLogger();
  }
  
  // Wait for session to be created before returning logger
  const sessionPath = await createLogSession(sourceFormat, targetFormat, model);
  const quota = createSessionQuota();
  
  return {
    get sessionPath() { return sessionPath; },
    
    // 1. Log client raw request (before any conversion)
    logClientRawRequest(endpoint, body, headers = {}) {
      writeJsonFile(sessionPath, quota, "1_req_client.json", {
        timestamp: new Date().toISOString(),
        endpoint,
        headers: maskSensitiveHeaders(headers),
        body
      });
    },
    
    // 2. Log raw request from client (after initial conversion like responsesApi)
    logRawRequest(body, headers = {}) {
      writeJsonFile(sessionPath, quota, "2_req_source.json", {
        timestamp: new Date().toISOString(),
        headers: maskSensitiveHeaders(headers),
        body
      });
    },
    
    // 3. Log OpenAI intermediate format (source → openai)
    logOpenAIRequest(body) {
      writeJsonFile(sessionPath, quota, "3_req_openai.json", {
        timestamp: new Date().toISOString(),
        body
      });
    },
    
    // 4. Log target format request (openai → target)
    logTargetRequest(url, headers, body) {
      writeJsonFile(sessionPath, quota, "4_req_target.json", {
        timestamp: new Date().toISOString(),
        url,
        headers: maskSensitiveHeaders(headers),
        body
      });
    },
    
    // 5. Log provider response (for non-streaming or error)
    logProviderResponse(status, statusText, headers, body) {
      const filename = "5_res_provider.json";
      writeJsonFile(sessionPath, quota, filename, {
        timestamp: new Date().toISOString(),
        status,
        statusText,
        headers: maskSensitiveHeaders(headers ? (typeof headers.entries === "function" ? Object.fromEntries(headers.entries()) : headers) : {}),
        body
      });
    },
    
    // 5. Append streaming chunk to provider response
    appendProviderChunk(chunk) {
      if (!fs || !sessionPath) return;
      try {
        writeBounded(sessionPath, quota, "5_res_provider.txt", chunk, { append: true });
      } catch (err) {
        // Ignore append errors
      }
    },
    
    // 6. Append OpenAI intermediate chunks (target → openai)
    appendOpenAIChunk(chunk) {
      if (!fs || !sessionPath) return;
      try {
        writeBounded(sessionPath, quota, "6_res_openai.txt", chunk, { append: true });
      } catch (err) {
        // Ignore append errors
      }
    },
    
    // 7. Log converted response to client (for non-streaming)
    logConvertedResponse(body) {
      writeJsonFile(sessionPath, quota, "7_res_client.json", {
        timestamp: new Date().toISOString(),
        body
      });
    },
    
    // 7. Append streaming chunk to converted response
    appendConvertedChunk(chunk) {
      if (!fs || !sessionPath) return;
      try {
        writeBounded(sessionPath, quota, "7_res_client.txt", chunk, { append: true });
      } catch (err) {
        // Ignore append errors
      }
    },
    
    // 6. Log error
    logError(error, requestBody = null) {
      writeJsonFile(sessionPath, quota, "6_error.json", {
        timestamp: new Date().toISOString(),
        error: error?.message || String(error),
        stack: error?.stack,
        requestBody
      });
    }
  };
}

// Legacy functions for backward compatibility
export function logRequest() {}
export function logResponse() {}
export function logError(provider, { error, url, model, requestBody }) {
  if (!fs || !LOGS_DIR) return;
  
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    
    const date = new Date().toISOString().split("T")[0];
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: "error",
      provider,
      model,
      url,
      error: error?.message || String(error),
      stack: error?.stack,
      requestBody
    };
    
    writeBounded(LOGS_DIR, legacyQuota, `${provider}-${date}.log`, JSON.stringify(logEntry) + "\n", { append: true });
  } catch (err) {
    console.log("[LOG] Failed to write error log:", err.message);
  }
}
