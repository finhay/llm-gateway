import { machineIdSync } from 'node-machine-id';

const CACHE_KEY = '__llmGatewayConsistentMachineIds';

function getMachineIdCache() {
  if (!globalThis[CACHE_KEY]) globalThis[CACHE_KEY] = new Map();
  return globalThis[CACHE_KEY];
}

async function resolveConsistentMachineId(saltValue) {
  try {
    const rawMachineId = machineIdSync();
    const crypto = await import('crypto');
    const hashedMachineId = crypto.createHash('sha256').update(rawMachineId + saltValue).digest('hex');
    return hashedMachineId.substring(0, 16);
  } catch (error) {
    console.log('Error getting machine ID:', error);
    // Containers may not expose /etc/machine-id. Generate one process-local
    // fallback and let getConsistentMachineId cache it for all server chunks.
    const crypto = await import('crypto');
    return crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex');
  }
}

/**
 * Get consistent machine ID using node-machine-id with salt
 * This ensures the same physical machine gets the same ID across runs
 * 
 * @param {string} salt - Optional salt to use (defaults to environment variable)
 * @returns {Promise<string>} Machine ID (16-character base32)
 */
export function getConsistentMachineId(salt = null) {
  const saltValue = salt || process.env.MACHINE_ID_SALT || 'endpoint-proxy-salt';
  const cache = getMachineIdCache();
  if (!cache.has(saltValue)) {
    const pending = resolveConsistentMachineId(saltValue).catch((error) => {
      cache.delete(saltValue);
      throw error;
    });
    cache.set(saltValue, pending);
  }
  return cache.get(saltValue);
}

/**
 * Get raw machine ID without hashing (for debugging purposes)
 * @returns {Promise<string>} Raw machine ID
 */
export async function getRawMachineId() {
  // For server-side, use raw node-machine-id
  try {
    return machineIdSync();
  } catch (error) {
    console.log('Error getting raw machine ID:', error);
    const crypto = await import('crypto');
    return crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex');
  }
}

/**
 * Check if we're running in browser or server environment
 * @returns {boolean} True if in browser, false if in server
 */
export function isBrowser() {
  return typeof window !== 'undefined';
}
