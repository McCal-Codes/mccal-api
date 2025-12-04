/**
 * Cloudflare Environment Configuration
 *
 * Loads configuration from Cloudflare Vars and handles env var fallbacks.
 * Designed to work with both Workers and Node.js environments.
 *
 * Usage:
 *   const config = require('./cf-config');
 *   const cfg = config.load(env); // Pass Cloudflare env object
 */

const defaults = {
  allowedOrigins: [
    "https://mcc-cal.com",
    "https://*.squarespace.com",
    "https://api.mcc-cal.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  manifestTypes: [
    "concert",
    "events",
    "journalism",
    "nature",
    "portrait",
    "portfolio",
  ],
  manifestBaseUrl: "https://McCal-Codes.github.io/McCals-Website/src/images/Portfolios",
  cacheMaxAge: 300, // 5 minutes
  cacheStaleTtl: 3600, // 1 hour
  nodeEnv: process.env.NODE_ENV || "production",
};

/**
 * Load configuration from Cloudflare env or process.env
 * @param {object} env - Cloudflare env object
 * @returns {object} Configuration object
 */
function load(env = {}) {
  return {
    // CORS & Origins
    allowedOrigins:
      (env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) || defaults.allowedOrigins,

    // Manifest configuration
    manifestTypes:
      (env.MANIFEST_TYPES || process.env.MANIFEST_TYPES || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) || defaults.manifestTypes,

    manifestBaseUrl:
      env.MANIFEST_BASE_URL ||
      process.env.MANIFEST_BASE_URL ||
      defaults.manifestBaseUrl,

    // Blog authentication
    blogJwtSecret:
      env.BLOG_JWT_SECRET || process.env.BLOG_JWT_SECRET || "dev-secret",

    webhookSecret:
      env.WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "dev-webhook",

    // Caching
    cacheMaxAge:
      parseInt(env.CACHE_MAX_AGE || process.env.CACHE_MAX_AGE || "300", 10) ||
      defaults.cacheMaxAge,

    cacheStaleTtl:
      parseInt(env.CACHE_STALE_TTL || process.env.CACHE_STALE_TTL || "3600", 10) ||
      defaults.cacheStaleTtl,

    // Environment
    nodeEnv: env.NODE_ENV || process.env.NODE_ENV || defaults.nodeEnv,

    // Debugging
    debug: env.DEBUG === "true" || process.env.DEBUG === "true",

    // Redis (optional, for local dev)
    redisUrl: env.REDIS_URL || process.env.REDIS_URL || null,

    // KV namespace (Cloudflare Workers only)
    kvNamespace: env.MCCAL_KV || null,
  };
}

/**
 * Check if config is valid for production
 * @param {object} config
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validate(config) {
  const errors = [];

  if (!config.manifestBaseUrl) {
    errors.push("MANIFEST_BASE_URL is required");
  }

  if (!config.allowedOrigins || config.allowedOrigins.length === 0) {
    errors.push("ALLOWED_ORIGINS is required");
  }

  if (config.nodeEnv === "production") {
    if (config.blogJwtSecret === "dev-secret") {
      errors.push("BLOG_JWT_SECRET must be set in production");
    }
    if (config.webhookSecret === "dev-webhook") {
      errors.push("WEBHOOK_SECRET must be set in production");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log configuration (safe version, doesn't log secrets)
 * @param {object} config
 */
function logSafe(config) {
  console.log("Configuration loaded:");
  console.log(`  - Node Environment: ${config.nodeEnv}`);
  console.log(`  - Manifest Base URL: ${config.manifestBaseUrl}`);
  console.log(`  - Allowed Origins: ${config.allowedOrigins.join(", ")}`);
  console.log(`  - Cache Max Age: ${config.cacheMaxAge}s`);
  console.log(
    `  - Webhook Secret: ${config.webhookSecret === "dev-webhook" ? "USING DEV SECRET" : "SET"}`
  );
  console.log(
    `  - JWT Secret: ${config.blogJwtSecret === "dev-secret" ? "USING DEV SECRET" : "SET"}`
  );
  console.log(`  - Debug Mode: ${config.debug}`);
}

module.exports = {
  load,
  validate,
  logSafe,
  defaults,
};
