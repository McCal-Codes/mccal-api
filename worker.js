/*
 * McCal API - Cloudflare Worker Entry
 * Production-ready minimal API router with CORS and JSON responses.
 *
 * Routes:
 *   - GET  /api/v1/health
 *   - GET  /api/v1/manifests            (list manifest types)
 *   - GET  /api/v1/manifests/:type      (fetch manifest by type)
 *   - GET  /api/v1/blog/posts           (list blog posts)
 *   - POST /api/v1/webhooks/purge       (purge manifest cache - requires secret)
 *   - POST /api/v1/webhooks/warm        (pre-warm manifest cache - requires secret)
 *   - GET  /api/v1/cache/stats          (cache hit/miss stats)
 *
 * Configuration (set via Cloudflare Vars or env):
 *   - ALLOWED_ORIGINS: comma-separated list of allowed origins
 *   - MANIFEST_BASE_URL: where manifests are hosted (GitHub Pages)
 *   - MANIFEST_TYPES: optional comma-separated list of manifest types
 *   - BLOG_BASE_URL: where blog-posts.json is hosted
 *   - WEBHOOK_SECRET: secret for webhook authentication
 *   - RATE_LIMIT_REQUESTS: max requests per window (default 100)
 *   - RATE_LIMIT_WINDOW_MS: rate limit window in ms (default 60000)
 *   - CACHE_TTL_SECONDS: cache TTL in seconds (default 600 = 10 min)
 */

/** Cache configuration */
const CACHE_CONFIG = {
  // Default 10 minute TTL for manifests (5-15 min range as specified)
  manifestTtlSeconds: 600,
  // Stale-while-revalidate window (1 hour)
  staleWhileRevalidateSeconds: 3600,
  // Widget HTML TTL (5 minutes, more frequently updated)
  widgetTtlSeconds: 300,
};

/** Rate limiting configuration */
const RATE_LIMIT_CONFIG = {
  maxRequests: 100,
  windowMs: 60000, // 1 minute
};

/** Global cache stats (in-memory, per-isolate) */
const cacheStats = {
  hits: 0,
  misses: 0,
  purges: 0,
  warms: 0,
  lastReset: Date.now(),
};

/** Utility: parse allowed origins from env to array */
function parseAllowedOrigins(env) {
  const raw = env?.ALLOWED_ORIGINS || "";
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/** Utility: check if origin matches allowed list (supports wildcard prefix with *.) */
function isOriginAllowed(origin, allowed) {
  if (!origin) return false;
  for (const rule of allowed) {
    if (rule === origin) return true;
    // Wildcard subdomain support: *.example.com
    if (rule.startsWith("*.")) {
      const base = rule.slice(2);
      if (origin === base || origin.endsWith(`.${base}`)) return true;
    }
    // Protocol-agnostic match by host only if rule starts with "."
    if (rule.startsWith(".")) {
      const url = new URL(origin);
      if (url.hostname === rule.slice(1) || url.hostname.endsWith(rule)) return true;
    }
  }
  return false;
}

/** Build CORS headers for a given request */
function corsHeaders(req, env) {
  const allowed = parseAllowedOrigins(env);
  const origin = req.headers.get("Origin");
  const headers = new Headers();
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Expose-Headers", "ETag, X-Cache, X-Cache-Hit, X-RateLimit-Remaining");
  
  // If origin is provided and allowed, use it; otherwise allow all (for development)
  if (origin && isOriginAllowed(origin, allowed)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else if (origin) {
    // Origin provided but not in allowed list - still allow for now (development mode)
    headers.set("Access-Control-Allow-Origin", origin);
  } else {
    // No origin header - set wildcard for development
    headers.set("Access-Control-Allow-Origin", "*");
  }
  
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Webhook-Secret");
  return headers;
}

/** Rate limiting using KV (per-IP throttling) */
async function checkRateLimit(req, env) {
  if (!env?.MCCAL_KV) {
    // No KV = no rate limiting (allow request)
    return { allowed: true, remaining: -1 };
  }
  
  const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Real-IP") || "unknown";
  const key = `ratelimit:${ip}`;
  const maxRequests = parseInt(env?.RATE_LIMIT_REQUESTS || RATE_LIMIT_CONFIG.maxRequests, 10);
  const windowMs = parseInt(env?.RATE_LIMIT_WINDOW_MS || RATE_LIMIT_CONFIG.windowMs, 10);
  const windowSec = Math.ceil(windowMs / 1000);
  
  try {
    const current = await env.MCCAL_KV.get(key, { type: "json" }) || { count: 0, start: Date.now() };
    const now = Date.now();
    
    // Reset window if expired
    if (now - current.start > windowMs) {
      current.count = 0;
      current.start = now;
    }
    
    current.count++;
    const remaining = Math.max(0, maxRequests - current.count);
    
    // Update counter with expiration
    await env.MCCAL_KV.put(key, JSON.stringify(current), { expirationTtl: windowSec });
    
    return {
      allowed: current.count <= maxRequests,
      remaining,
      limit: maxRequests,
      resetAt: new Date(current.start + windowMs).toISOString()
    };
  } catch (err) {
    // On error, allow request (fail open)
    console.error("Rate limit check failed:", err?.message);
    return { allowed: true, remaining: -1 };
  }
}

/** Validate webhook secret */
function validateWebhookSecret(req, env) {
  const secret = env?.WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured = reject in production, allow in dev
    const isProd = env?.ENVIRONMENT === "production" || env?.NODE_ENV === "production";
    return !isProd;
  }
  const provided = req.headers.get("X-Webhook-Secret") || new URL(req.url).searchParams.get("secret");
  return provided === secret;
}

/** JSON response helper */
function json(data, init = {}) {
  const body = JSON.stringify(data);
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(body, { ...init, headers });
}

/** Not found helper */
function notFound(req) {
  return json({ error: "not_found", message: `No route for ${req.method} ${new URL(req.url).pathname}`, timestamp: new Date().toISOString() }, { status: 404 });
}

/** Helper: get manifest types from env or default list */
function getManifestTypes(env) {
  const raw = env?.MANIFEST_TYPES || "";
  const parsed = raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (parsed.length) return parsed;
  // Default hardcoded list if env not provided
  return ["concert", "events", "journalism", "nature", "portrait", "portfolio"];
}

/** Helper: get cache TTL from env or default */
function getCacheTtl(env) {
  const ttl = parseInt(env?.CACHE_TTL_SECONDS, 10);
  return isNaN(ttl) ? CACHE_CONFIG.manifestTtlSeconds : ttl;
}

/** Helper: build manifest URL */
function buildManifestUrl(type, env) {
  const base = env?.MANIFEST_BASE_URL;
  if (!base) return null;
  
  // Map type to correct filename pattern
  const typeMap = {
    concert: "Concert/concert-manifest",
    events: "Events/events-manifest", 
    journalism: "Journalism/journalism-manifest",
    nature: "Nature/nature-manifest",
    portrait: "Portrait/portrait-manifest",
    featured: "featured-manifest",
    portfolio: "portfolio-manifest",
    universal: "portfolio-manifest"
  };
  
  const path = typeMap[type] || type;
  return `${base.replace(/\/$/, "")}/${path}.json`;
}

/** Helper: fetch manifest JSON by type with optional caching */
async function fetchManifest(type, env) {
  const url = buildManifestUrl(type, env);
  if (!url) {
    return {
      ok: false,
      status: 500,
      data: { error: "config_error", message: "MANIFEST_BASE_URL is not configured", timestamp: new Date().toISOString() }
    };
  }

  // Edge cache via caches.default
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      cacheStats.hits++;
      return { ok: true, status: 200, data, etag: cached.headers.get("ETag") || undefined, fromCache: true };
    } catch {
      // Fall through to network fetch if cache parse fails
    }
  }
  
  cacheStats.misses++;

  let resp;
  try {
    resp = await fetch(url, { method: "GET" });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { error: "upstream_fetch_failed", message: `Failed to fetch manifest: ${err?.message || "network error"}`, timestamp: new Date().toISOString() }
    };
  }

  if (resp.status === 404) {
    return {
      ok: false,
      status: 404,
      data: { error: "manifest_not_found", message: `Manifest not found for type: ${type}`, timestamp: new Date().toISOString() }
    };
  }

  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      data: { error: "upstream_error", message: `Upstream returned ${resp.status}`, timestamp: new Date().toISOString() }
    };
  }

  // Clone response for cache put and JSON parsing
  const forCache = resp.clone();
  const forJson = resp.clone();
  let data;
  try {
    data = await forJson.json();
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { error: "bad_json", message: `Invalid JSON: ${err?.message || "parse error"}`, timestamp: new Date().toISOString() }
    };
  }

  // Populate cache with proper TTL headers (best-effort)
  const ttl = getCacheTtl(env);
  try {
    const cacheHeaders = new Headers(forCache.headers);
    cacheHeaders.set("Cache-Control", `public, max-age=${ttl}, stale-while-revalidate=${CACHE_CONFIG.staleWhileRevalidateSeconds}`);
    const cacheResponse = new Response(JSON.stringify(data), {
      status: 200,
      headers: cacheHeaders
    });
    await cache.put(cacheKey, cacheResponse);
  } catch {
    // Ignore cache errors
  }

  // Weak ETag fallback if upstream didn't provide one
  let etag = resp.headers.get("ETag") || undefined;
  if (!etag) {
    try {
      const str = JSON.stringify(data);
      const enc = new TextEncoder().encode(str);
      const hashBuf = await crypto.subtle.digest("SHA-1", enc);
      const hashArr = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
      etag = `W/"${type}-${hashArr}"`;
    } catch {
      // If hashing fails, leave etag undefined
    }
  }

  return { ok: true, status: 200, data, etag, fromCache: false };
}

/** Helper: purge manifest from edge cache */
async function purgeManifestCache(type, env) {
  const url = buildManifestUrl(type, env);
  if (!url) return { ok: false, message: "Invalid type or missing config" };
  
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  
  try {
    const deleted = await cache.delete(cacheKey);
    cacheStats.purges++;
    return { ok: true, deleted, type, url };
  } catch (err) {
    return { ok: false, message: err?.message || "Cache delete failed" };
  }
}

/** Helper: warm manifest cache (fetch and store) */
async function warmManifestCache(type, env) {
  const result = await fetchManifest(type, env);
  if (result.ok && !result.fromCache) {
    cacheStats.warms++;
  }
  return {
    ok: result.ok,
    type,
    fromCache: result.fromCache,
    status: result.status
  };
}

/** Helper: purge all manifest caches */
async function purgeAllManifestCaches(env) {
  const types = getManifestTypes(env);
  const results = await Promise.all(types.map(t => purgeManifestCache(t, env)));
  return {
    purged: results.filter(r => r.ok && r.deleted).length,
    total: types.length,
    results
  };
}

/** Helper: warm all manifest caches */
async function warmAllManifestCaches(env) {
  const types = getManifestTypes(env);
  const results = await Promise.all(types.map(t => warmManifestCache(t, env)));
  return {
    warmed: results.filter(r => r.ok && !r.fromCache).length,
    cached: results.filter(r => r.ok && r.fromCache).length,
    failed: results.filter(r => !r.ok).length,
    total: types.length,
    results
  };
}

/** Router implementation */
class Router {
  constructor() {
    this.routes = [];
  }
  add(method, pattern, handler) {
    const parts = pattern.split("/").filter(Boolean);
    this.routes.push({ method: method.toUpperCase(), parts, handler });
  }
  match(req) {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const method = req.method.toUpperCase();
    for (const r of this.routes) {
      if (r.method !== method) continue;
      if (r.parts.length !== pathParts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const rp = r.parts[i];
        const pp = pathParts[i];
        if (rp.startsWith(":")) {
          params[rp.slice(1)] = decodeURIComponent(pp);
        } else if (rp !== pp) {
          ok = false; break;
        }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}

/** Helper: fetch blog posts from GitHub */
async function fetchBlogPosts(env) {
  const base = env?.BLOG_BASE_URL || "https://McCal-Codes.github.io/McCals-Website/src/images/blog";
  const url = `${base.replace(/\/$/, "")}/blog-posts.json`;

  // Try cache first
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      return { ok: true, status: 200, data, fromCache: true };
    } catch {
      // Fall through on parse error
    }
  }

  try {
    const resp = await fetch(url, { method: "GET" });

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        data: { error: "fetch_failed", message: `Failed to fetch blog posts: ${resp.status}` }
      };
    }

    const forCache = resp.clone();
    const forJson = resp.clone();
    const data = await forJson.json();

    // Cache for 1 hour
    try {
      const cacheResp = new Response(forCache.body, forCache);
      cacheResp.headers.set("Cache-Control", "public, max-age=3600");
      await cache.put(cacheKey, cacheResp);
    } catch {
      // Ignore cache errors
    }

    return { ok: true, status: 200, data, fromCache: false };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { error: "upstream_error", message: `Failed to fetch blog posts: ${err?.message || "unknown"}` }
    };
  }
}

/** Helper: parse authors list from env */
function parseAuthors(env) {
  const raw = env?.BLOG_AUTHORS || env?.BLOG_AUTHORS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.authors)) return parsed.authors;
    } catch (_) {
      // fall back to default below
    }
  }
  return [
    {
      id: "auth-dev-001",
      username: "demo",
      password: "demo-pass",
      name: "Demo Author"
    }
  ];
}

/** Helper: load blog posts preferring KV cache */
async function loadBlogPosts(env) {
  const kv = env?.MCCAL_KV;
  if (kv) {
    try {
      const stored = await kv.get("blog:posts", { type: "json" });
      if (stored && Array.isArray(stored.posts)) {
        return { ok: true, status: 200, data: stored, source: "kv" };
      }
    } catch (_) {
      // ignore and fall through to upstream fetch
    }
  }
  const upstream = await fetchBlogPosts(env);
  if (upstream.ok && kv) {
    try {
      await kv.put("blog:posts", JSON.stringify(upstream.data));
    } catch (_) {
      // ignore write errors
    }
  }
  return upstream;
}

/** Helper: persist posts to KV */
async function persistBlogPosts(env, data) {
  if (!env?.MCCAL_KV) {
    throw new Error("kv_not_configured");
  }
  await env.MCCAL_KV.put("blog:posts", JSON.stringify(data));
}

/** Helper: issue session token stored in KV */
async function issueSessionToken(env, author) {
  if (!env?.MCCAL_KV) {
    throw new Error("kv_not_configured");
  }
  const token = (typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
  const payload = {
    id: author.id,
    username: author.username,
    name: author.name,
    issuedAt: Date.now()
  };
  await env.MCCAL_KV.put(`blog:token:${token}`, JSON.stringify(payload), {
    expirationTtl: 60 * 60 * 24 // 1 day
  });
  return { token, payload };
}

/** Helper: load session from Authorization header */
async function getSessionFromRequest(req, env) {
  if (!env?.MCCAL_KV) {
    return { ok: false, status: 501, data: { error: "kv_not_configured", message: "Blog authoring requires KV storage" } };
  }
  const header = req.headers.get("Authorization") || "";
  const [scheme, value] = header.split(" ");
  if (scheme !== "Bearer" || !value) {
    return { ok: false, status: 401, data: { error: "unauthorized", message: "Missing token" } };
  }
  const session = await env.MCCAL_KV.get(`blog:token:${value}`, { type: "json" });
  if (!session) {
    return { ok: false, status: 401, data: { error: "unauthorized", message: "Invalid token" } };
  }
  return { ok: true, status: 200, data: session, token: value };
}

/** Build API router */
function buildApiRouter(env) {
  const router = new Router();

  // Blog API root health/info endpoint
  router.add("GET", "api/v1/blog", async () => {
    return json({
      status: "ok",
      message: "Blog API root",
      time: new Date().toISOString(),
      endpoints: [
        "/api/v1/blog/auth/login",
        "/api/v1/blog/posts",
        "/api/v1/blog/posts (POST)"
      ]
    });
  });

  // Root: provide a minimal index
  router.add("GET", "", async () => {
    return json({
      name: "McCal API",
      status: "ok",
      timestamp: new Date().toISOString(),
      routes: {
        health: "/api/v1/health",
        manifests: "/api/v1/manifests",
        manifestByType: "/api/v1/manifests/:type"
      }
    });
  });

  // Aliases for index under /api and /api/v1
  router.add("GET", "api", async () => {
    return json({
      name: "McCal API",
      status: "ok",
      timestamp: new Date().toISOString(),
      routes: {
        health: "/api/v1/health",
        manifests: "/api/v1/manifests",
        manifestByType: "/api/v1/manifests/:type"
      }
    });
  });
  router.add("GET", "api/v1", async () => {
    return json({
      name: "McCal API",
      status: "ok",
      timestamp: new Date().toISOString(),
      routes: {
        health: "/api/v1/health",
        manifests: "/api/v1/manifests",
        manifestByType: "/api/v1/manifests/:type"
      }
    });
  });

  // Health check
  router.add("GET", "api/v1/health", async () => {
    return json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      cache: {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRate: cacheStats.hits + cacheStats.misses > 0 
          ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1) + "%" 
          : "N/A"
      }
    });
  });

  // Manifests list from env or defaults
  router.add("GET", "api/v1/manifests", async (_req) => {
    const types = getManifestTypes(env);
    return json({ types });
  });

  // Manifest by type fetched from website repo
  router.add("GET", "api/v1/manifests/:type", async (req, params) => {
    const { type } = params;
    
    // Check If-None-Match for ETag validation
    const clientETag = req.headers.get("If-None-Match");
    
    const result = await fetchManifest(type, env);
    if (!result.ok) {
      return json(result.data, { status: result.status });
    }
    
    // ETag match = 304 Not Modified
    if (clientETag && result.etag && clientETag === result.etag) {
      return new Response(null, { 
        status: 304,
        headers: { "ETag": result.etag }
      });
    }
    
    const ttl = getCacheTtl(env);
    const headers = {
      // Edge caching: 10 min TTL with 1 hour stale-while-revalidate
      "Cache-Control": `public, max-age=${ttl}, stale-while-revalidate=${CACHE_CONFIG.staleWhileRevalidateSeconds}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Cache": result.fromCache ? "HIT" : "MISS",
      "X-Cache-Hit": result.fromCache ? "true" : "false"
    };
    if (result.etag) headers["ETag"] = result.etag;
    return json(result.data, { status: 200, headers });
  });
  
  // Cache stats endpoint
  router.add("GET", "api/v1/cache/stats", async () => {
    const uptime = Date.now() - cacheStats.lastReset;
    return json({
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      purges: cacheStats.purges,
      warms: cacheStats.warms,
      hitRate: cacheStats.hits + cacheStats.misses > 0 
        ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1) + "%" 
        : "N/A",
      uptimeMs: uptime,
      lastReset: new Date(cacheStats.lastReset).toISOString()
    });
  });
  
  // Webhook: Purge cache for specific manifest type
  router.add("POST", "api/v1/webhooks/purge/:type", async (req, params) => {
    if (!validateWebhookSecret(req, env)) {
      return json({ error: "unauthorized", message: "Invalid webhook secret" }, { status: 401 });
    }
    const { type } = params;
    const result = await purgeManifestCache(type, env);
    return json({
      success: result.ok,
      action: "purge",
      type,
      ...result,
      timestamp: new Date().toISOString()
    }, { status: result.ok ? 200 : 500 });
  });
  
  // Webhook: Purge all manifest caches
  router.add("POST", "api/v1/webhooks/purge", async (req) => {
    if (!validateWebhookSecret(req, env)) {
      return json({ error: "unauthorized", message: "Invalid webhook secret" }, { status: 401 });
    }
    const result = await purgeAllManifestCaches(env);
    return json({
      success: true,
      action: "purge-all",
      ...result,
      timestamp: new Date().toISOString()
    });
  });
  
  // Webhook: Warm cache for specific manifest type
  router.add("POST", "api/v1/webhooks/warm/:type", async (req, params) => {
    if (!validateWebhookSecret(req, env)) {
      return json({ error: "unauthorized", message: "Invalid webhook secret" }, { status: 401 });
    }
    const { type } = params;
    const result = await warmManifestCache(type, env);
    return json({
      success: result.ok,
      action: "warm",
      type,
      ...result,
      timestamp: new Date().toISOString()
    }, { status: result.ok ? 200 : 500 });
  });
  
  // Webhook: Warm all manifest caches (pre-warm after publish)
  router.add("POST", "api/v1/webhooks/warm", async (req) => {
    if (!validateWebhookSecret(req, env)) {
      return json({ error: "unauthorized", message: "Invalid webhook secret" }, { status: 401 });
    }
    const result = await warmAllManifestCaches(env);
    return json({
      success: true,
      action: "warm-all",
      ...result,
      timestamp: new Date().toISOString()
    });
  });
  
  // Webhook: Combined purge and warm (for CI/CD after manifest publish)
  router.add("POST", "api/v1/webhooks/refresh", async (req) => {
    if (!validateWebhookSecret(req, env)) {
      return json({ error: "unauthorized", message: "Invalid webhook secret" }, { status: 401 });
    }
    // First purge all caches
    const purgeResult = await purgeAllManifestCaches(env);
    // Then warm all caches
    const warmResult = await warmAllManifestCaches(env);
    return json({
      success: true,
      action: "refresh",
      purge: purgeResult,
      warm: warmResult,
      timestamp: new Date().toISOString()
    });
  });

  // Blog posts list
  router.add("GET", "api/v1/blog/posts", async (_req) => {
    const result = await loadBlogPosts(env);
    if (!result.ok) {
      return json(result.data, { status: result.status });
    }
    const headers = {
      "Cache-Control": "public, max-age=3600"
    };
    return json(result.data, { status: 200, headers });
  });

  // Blog author login
  router.add("POST", "api/v1/blog/auth/login", async (req) => {
    if (!env?.MCCAL_KV) {
      return json(
        { error: "kv_not_configured", message: "Blog login requires KV storage" },
        { status: 501 }
      );
    }
    let body;
    try {
      body = await req.json();
    } catch (_) {
      return json({ error: "invalid_json", message: "Body must be valid JSON" }, { status: 400 });
    }
    const username = (body?.username || "").trim();
    const password = body?.password || "";
    if (!username || !password) {
      return json({ error: "bad_request", message: "username and password required" }, { status: 400 });
    }
    const authors = parseAuthors(env);
    const author = authors.find((a) => a.username === username && a.password === password);
    if (!author) {
      return json({ error: "unauthorized", message: "Invalid credentials" }, { status: 401 });
    }
    const { token, payload } = await issueSessionToken(env, author);
    return json({ token, author: payload }, { status: 200 });
  });

  // Blog post creation
  router.add("POST", "api/v1/blog/posts", async (req) => {
    if (!env?.MCCAL_KV) {
      return json(
        { error: "kv_not_configured", message: "Blog publishing requires KV storage" },
        { status: 501 }
      );
    }
    const session = await getSessionFromRequest(req, env);
    if (!session.ok) {
      return json(session.data, { status: session.status });
    }
    let body;
    try {
      body = await req.json();
    } catch (_) {
      return json({ error: "invalid_json", message: "Body must be valid JSON" }, { status: 400 });
    }
    const title = (body?.title || "").trim();
    const excerpt = (body?.excerpt || "").trim();
    const content = Array.isArray(body?.content) ? body.content.map((p) => String(p)) : [];
    const images = Array.isArray(body?.images) ? body.images : [];
    if (!title || !excerpt || !content.length) {
      return json(
        { error: "bad_request", message: "title, excerpt, and content[] required" },
        { status: 400 }
      );
    }

    // Load existing posts (fallback to empty if upstream fails)
    const current = await loadBlogPosts(env);
    const data = current.ok && Array.isArray(current.data?.posts) ? current.data : { posts: [] };
    const now = new Date();
    const post = {
      title,
      author: session.data?.name || session.data?.username || "Author",
      date: now.toISOString().split("T")[0],
      excerpt,
      body: content,
      ...(images.length
        ? {
            images: images.map((img) => ({
              src: String(img?.src || ""),
              alt: String(img?.alt || ""),
              caption: img?.caption ? String(img.caption) : undefined
            }))
          }
        : {})
    };
    data.posts = Array.isArray(data.posts) ? data.posts : [];
    data.posts.unshift(post);
    await persistBlogPosts(env, data);
    return json({ success: true, post }, { status: 201 });
  });

  return router;
}

export default {
  async fetch(req, env, ctx) {
    // Generate request id for observability
    let reqId = "";
    try {
      const rand = new Uint8Array(12);
      crypto.getRandomValues(rand);
      reqId = Array.from(rand).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {
      reqId = Math.random().toString(36).slice(2);
    }
    
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      const headers = corsHeaders(req, env);
      headers.set("X-Request-Id", reqId);
      return new Response(null, { status: 204, headers });
    }

    const headers = corsHeaders(req, env);
    
    // Rate limiting for manifest endpoints (skip for webhooks which have their own auth)
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/v1/manifests")) {
      const rateLimit = await checkRateLimit(req, env);
      headers.set("X-RateLimit-Limit", String(rateLimit.limit || RATE_LIMIT_CONFIG.maxRequests));
      headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
      if (rateLimit.resetAt) {
        headers.set("X-RateLimit-Reset", rateLimit.resetAt);
      }
      
      if (!rateLimit.allowed) {
        headers.set("X-Request-Id", reqId);
        headers.set("Retry-After", "60");
        return new Response(
          JSON.stringify({ 
            error: "rate_limit_exceeded", 
            message: "Too many requests. Please try again later.",
            retryAfter: 60,
            timestamp: new Date().toISOString()
          }),
          { 
            status: 429, 
            headers: {
              ...Object.fromEntries(headers),
              "Content-Type": "application/json; charset=utf-8"
            }
          }
        );
      }
    }
    
    const router = buildApiRouter(env);
    const match = router.match(req);

    try {
      if (match) {
        const res = await match.handler(req, match.params, env, ctx);
        // Merge CORS headers into response
        const outHeaders = new Headers(res.headers);
        for (const [k, v] of headers) outHeaders.set(k, v);
        outHeaders.set("X-Request-Id", reqId);
        return new Response(res.body, { status: res.status || 200, headers: outHeaders });
      }
      const nf = notFound(req);
      const outHeaders = new Headers(nf.headers);
      for (const [k, v] of headers) outHeaders.set(k, v);
      outHeaders.set("X-Request-Id", reqId);
      return new Response(nf.body, { status: 404, headers: outHeaders });
    } catch (err) {
      const body = { error: "internal_error", message: (err && err.message) || "Unknown error", timestamp: new Date().toISOString() };
      const res = json(body, { status: 500 });
      const outHeaders = new Headers(res.headers);
      for (const [k, v] of headers) outHeaders.set(k, v);
      outHeaders.set("X-Request-Id", reqId);
      return new Response(res.body, { status: 500, headers: outHeaders });
    }
  }
};
