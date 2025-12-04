/**
 * Cloudflare KV Cache Client
 *
 * Minimal adapter for Cloudflare Workers KV storage.
 * Used for caching manifests and reducing API requests.
 *
 * Usage:
 *   const kv = require('./cf-kv-client');
 *   await kv.set('key', value, { ttl: 3600 });
 *   const data = await kv.get('key');
 */

class CloudflareKVClient {
  constructor(env) {
    // In Cloudflare Workers, KV is bound as env.MCCAL_KV
    this.kv = env?.MCCAL_KV || null;
    this.isAvailable = !!this.kv;
  }

  /**
   * Get value from KV
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async get(key) {
    if (!this.isAvailable) return null;

    try {
      const value = await this.kv.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value; // Return raw string if not JSON
      }
    } catch (error) {
      console.error(`KV get error for ${key}: - cf-kv-client.js:38`, error);
      return null;
    }
  }

  /**
   * Set value in KV
   * @param {string} key
   * @param {any} value
   * @param {object} options - { ttl: seconds }
   * @returns {Promise<boolean>}
   */
  async set(key, value, options = {}) {
    if (!this.isAvailable) return false;

    try {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);

      await this.kv.put(key, serialized, {
        expirationTtl: options.ttl || undefined,
      });

      return true;
    } catch (error) {
      console.error(`KV set error for ${key}: - cf-kv-client.js:63`, error);
      return false;
    }
  }

  /**
   * Delete value from KV
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    if (!this.isAvailable) return false;

    try {
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error(`KV delete error for ${key}: - cf-kv-client.js:80`, error);
      return false;
    }
  }

  /**
   * Check if KV is available
   * @returns {boolean}
   */
  available() {
    return this.isAvailable;
  }

  /**
   * Health check
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async health() {
    if (!this.isAvailable) {
      return { ok: false, message: "KV not bound" };
    }

    try {
      const key = "__health_check__";
      await this.set(key, { timestamp: new Date().toISOString() }, { ttl: 60 });
      const value = await this.get(key);
      await this.delete(key);

      return {
        ok: !!value,
        message: "KV operational",
      };
    } catch (error) {
      return {
        ok: false,
        message: `KV health check failed: ${error.message}`,
      };
    }
  }
}

// Export singleton pattern with env injection
module.exports = (env) => new CloudflareKVClient(env);
