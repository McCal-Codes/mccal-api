/*
 * McCal API - Cloudflare Worker Entry
 * Production-ready minimal API router with CORS and JSON responses.
 * Routes:
 *   - GET  /api/v1/health
 *   - GET  /api/v1/manifests            (list manifest types)
 *   - GET  /api/v1/manifests/:type      (fetch manifest by type)
 *
 * Configuration:
 *   - ALLOWED_ORIGINS: comma-separated list of allowed origins (set via Cloudflare Vars)
 *   - Optionally integrate with KV/Redis/Upstash in future iterations
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
  headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
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

/** Build API router */
function buildApiRouter(env) {
  const router = new Router();

  // Health check
  router.add("GET", "api/v1/health", async () => {
    return json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Manifests list (static placeholder; integrate with storage later)
  router.add("GET", "api/v1/manifests", async () => {
    const types = ["concert", "events", "journalism", "nature", "portrait", "portfolio"];
    return json({ types });
  });

  // Manifest by type (placeholder response)
  router.add("GET", "api/v1/manifests/:type", async (_req, params) => {
    const { type } = params;
    // Placeholder manifest schema; in future, fetch from KV/Redis or Git submodule files.
    const manifest = {
      type,
      items: [],
      updatedAt: new Date().toISOString()
    };
    return json(manifest, { headers: { ETag: `W/\"${type}-${manifest.updatedAt}\"` } });
  });

  return router;
}

export default {
  async fetch(req, env, ctx) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      const headers = corsHeaders(req, env);
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
        return new Response(res.body, { status: res.status || 200, headers: outHeaders });
      }
      const nf = notFound(req);
      const outHeaders = new Headers(nf.headers);
      for (const [k, v] of headers) outHeaders.set(k, v);
      return new Response(nf.body, { status: 404, headers: outHeaders });
    } catch (err) {
      const body = { error: "internal_error", message: (err && err.message) || "Unknown error", timestamp: new Date().toISOString() };
      const res = json(body, { status: 500 });
      const outHeaders = new Headers(res.headers);
      for (const [k, v] of headers) outHeaders.set(k, v);
      return new Response(res.body, { status: 500, headers: outHeaders });
    }
  }
};
