/*
 * McCal API - Cloudflare Worker Entry
 * Production-ready minimal API router with CORS and JSON responses.
 *
 * Routes:
 *   - GET  /api/v1/health
 *   - GET  /api/v1/manifests            (list manifest types)
 *   - GET  /api/v1/manifests/:type      (fetch manifest by type)
 *   - GET  /api/v1/blog/posts           (list blog posts)
 *
 * Configuration (set via Cloudflare Vars or env):
 *   - ALLOWED_ORIGINS: comma-separated list of allowed origins
 *   - MANIFEST_BASE_URL: where manifests are hosted (GitHub Pages)
 *   - MANIFEST_TYPES: optional comma-separated list of manifest types
 *   - BLOG_BASE_URL: where blog-posts.json is hosted
 */

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
  headers.set("Access-Control-Expose-Headers", "ETag");
  if (origin && isOriginAllowed(origin, allowed)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return headers;
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

/** Helper: fetch manifest JSON by type with optional caching */
async function fetchManifest(type, env) {
  const base = env?.MANIFEST_BASE_URL;
  if (!base) {
    return {
      ok: false,
      status: 500,
      data: { error: "config_error", message: "MANIFEST_BASE_URL is not configured", timestamp: new Date().toISOString() }
    };
  }
  const url = `${base.replace(/\/$/, "")}/${encodeURIComponent(type)}.json`;

  // Edge cache via caches.default
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      return { ok: true, status: 200, data, etag: cached.headers.get("ETag") || undefined, fromCache: true };
    } catch {
      // Fall through to network fetch if cache parse fails
    }
  }

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

  // Populate cache (best-effort)
  try {
    await cache.put(cacheKey, forCache);
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
    return json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Manifests list from env or defaults
  router.add("GET", "api/v1/manifests", async (_req) => {
    const types = getManifestTypes(env);
    return json({ types });
  });

  // Manifest by type fetched from website repo
  router.add("GET", "api/v1/manifests/:type", async (_req, params) => {
    const { type } = params;
    const result = await fetchManifest(type, env);
    if (!result.ok) {
      return json(result.data, { status: result.status });
    }
    const headers = {
      // Encourage client caching while allowing quick revalidation
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
    };
    if (result.etag) headers["ETag"] = result.etag;
    return json(result.data, { status: 200, headers });
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
