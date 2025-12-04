# McCal Media API - Copilot Instructions

## Purpose

This file defines agent behavior and workspace guardrails for the **McCal Media API** repository. This is a companion API service that works alongside the McCals-Website repo to serve portfolio data dynamically.

## TODO Tree Extension Compatibility

All TODO/task files must use standard tags like `TODO`, `FIXME`, `BUG`, etc., and/or markdown checklists (`- [ ]`, `- [x]`) for VS Code Todo Tree compatibility.

- Use `TODO:` or `FIXME:` at the start of a line or after a comment marker
- For markdown, use checklist items (`- [ ]` for incomplete, `- [x]` for complete)
- When adding a TODO in code, also add an entry in updates/todo.md or updates/done.md for traceability

## Repository Overview

**Architecture Role:**
- **This repo (mccal-api)**: REST API service for dynamic manifest serving, caching, and data endpoints. This repo is consumed as a **Git submodule** in the McCals-Website repository.
- **McCals-Website repo**: Static widgets, Squarespace integration, manifest generation. Mounts this API repo as submodule at `src/api/`.
- **Integration**: Website repo consumes this API code via submodule; widgets fetch live data from deployed API at `api.mcc-cal.com`
- **Deployment**: Cloudflare Worker at `api.mcc-cal.com` (CNAME configured), serving API endpoints to Squarespace site at `mcc-cal.com`

**Key Technologies:**
- Node.js + Express (REST API)
- Redis (caching layer)
- Cloudflare Workers/Pages (deployment target)
- CORS configuration for Squarespace domains

## Agent Responsibilities

- **Always read these instructions first** when starting any session in this workspace
- **Update these instructions** when discovering new patterns or API conventions
- **Add entries to Recent updates** section for significant changes
- **Update main README.md** when making architectural changes to endpoints, caching, or deployment

## Source Layout

```
mccal-api/
├── src/
│   └── api/
│       ├── server.js          # Express server entry point
│       ├── routes/            # API route handlers
│       │   ├── health.js      # Health check endpoint
│       │   ├── manifests.js   # Manifest CRUD operations
│       │   ├── blog.js        # Blog RSS/content endpoints
│       │   ├── webhooks.js    # GitHub/external webhooks
│       │   └── admin.js       # Admin/privileged endpoints
│       ├── versions/          # API versioning
│       │   └── v1/            # Version 1 routes
│       ├── config/            # Configuration files
│       │   └── manifests.js   # Manifest type definitions
│       ├── cache/             # Redis cache client
│       │   └── redis-client.js
│       └── proxy-middleware.js # Proxy utilities
├── scripts/                   # Utilities and tooling
│   ├── utils/                 # Cache warming, health checks
│   ├── admin/                 # Deployment, monitoring scripts
│   └── manifest/              # Manifest sync from website repo
├── docs/                      # API documentation
│   ├── deployment/            # Cloudflare deployment guides
│   ├── integrations/          # Widget integration patterns
│   └── standards/             # API conventions, security
└── package.json
```

## API Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Start dev server (with auto-reload)
npm run api:dev

# Start production mode
npm run api:start
```

Server runs on `http://localhost:3001` by default (configurable via `API_PORT` env var).

### Adding New Endpoints

1. Create route handler in `src/api/routes/` or add to existing route file
2. Import and mount in appropriate version router (`src/api/versions/v1/index.js`)
3. Add CORS origin if needed in `src/api/server.js`
4. Document endpoint in `docs/integrations/api-integration-guide.md`
5. Update README.md with new endpoint specification

## Manifest Consumption

**Submodule Architecture:**
- This API repo is a **Git submodule** consumed by the McCals-Website repo
- Website repo mounts this API at `src/api/` via submodule
- Website repo generates manifests at `src/images/Portfolios/` and this API reads them
- When developing locally, this API reads manifests from the parent website repo structure
- In production (Cloudflare), manifests are bundled or fetched during deployment

**Manifest paths** (relative to website repo root):
- `src/images/Portfolios/Concert/concert-manifest.json`
- `src/images/Portfolios/Events/events-manifest.json`
- `src/images/Portfolios/Journalism/journalism-manifest.json`
- `src/images/Portfolios/Nature/nature-manifest.json`
- `src/images/Portfolios/Portrait/portrait-manifest.json`
- `src/images/Portfolios/portfolio-manifest.json` (universal rollup)

## Caching Strategy

- **Redis cache**: Primary caching layer for manifest data
- **Cache warming**: On startup, preload all manifests into Redis
- **TTL**: Configurable per manifest type (default: 1 hour for dynamic, 24 hours for static)
- **Invalidation**: Webhook endpoint to invalidate cache when website repo updates manifests

## CORS Configuration

- Allow Squarespace domains (`.squarespace.com`, `.sqsp.com`)
- Allow production domain (`mcc-cal.com` and `*.mcc-cal.com`)
- Allow API subdomain (`api.mcc-cal.com`)
- Support preflight (`OPTIONS`) requests
- Return proper `Access-Control-*` headers

**Domain Setup:**
- Primary site: `mcc-cal.com` (hosted by Squarespace)
- API endpoint: `api.mcc-cal.com` (Cloudflare Worker, CNAME configured)
- Cloudflare manages DNS with CNAME for `api.mcc-cal.com` pointing to Worker

## API Response Patterns

- Always return JSON with proper `Content-Type: application/json`
- Include `ETag` header for cacheable responses
- Return `Cache-Control` headers for client-side caching
- Standard error format: `{ error, message, timestamp }`

## Deployment to Cloudflare

This API is designed for deployment to Cloudflare Workers or Pages Functions:

**Cloudflare Workers:**
- Serverless execution at the edge
- Global distribution (low latency)
- Native Redis integration via Upstash or Cloudflare KV
- Automatic SSL/TLS

**Deployment steps:**
1. Install Wrangler CLI: `npm install -g wrangler`
2. Configure `wrangler.toml` with routes and environment variables
3. Deploy: `wrangler deploy` (or `wrangler publish`)
4. DNS: CNAME `api.mcc-cal.com` → Cloudflare Worker (already configured)
5. SSL/TLS: Automatic via Cloudflare

**Environment Variables:**
- `API_PORT`: Local development port (default: 3001)
- `NODE_ENV`: `development` | `production`
- `REDIS_URL`: Redis connection string
- `API_KEY`: Optional API key for privileged endpoints

## Integration with Website Repo

**Widget consumption pattern:**
```javascript
// Widget fetches manifest from this API instead of static JSON
fetch('https://api.mcc-cal.com/api/v1/manifests/concert')
  .then(r => r.json())
  .then(data => {
    // Use manifest data to populate widget
  });
```

**Webhook pattern** (for cache invalidation):
```bash
# Website repo CI can trigger after manifest regeneration
POST https://api.mcc-cal.com/api/v1/webhooks/invalidate-cache
Authorization: Bearer <API_KEY>
{ "manifestType": "concert" }
```

## Safe-Change Checklist for Agents

- Test API endpoints locally before deploying: `npm run api:dev`
- Validate CORS configuration doesn't break widget integration
- Update API documentation when adding/modifying endpoints
- Run cache warming after manifest schema changes
- Keep error responses consistent with established patterns
- Document breaking changes in CHANGELOG.md
- Verify Redis connection before startup (graceful degradation if unavailable)

## Good Starting References

- `src/api/server.js` — Express server configuration and middleware setup
- `src/api/routes/` — API route handlers (health, manifests, blog, webhooks, admin)
- `src/api/cache/redis-client.js` — Redis caching implementation
- `src/api/config/manifests.js` — Manifest type definitions and paths
- `docs/integrations/api-integration-guide.md` — How widgets consume this API
- `docs/deployment/API-DEPLOYMENT-GUIDE.md` — Cloudflare deployment instructions
- `docs/standards/` — API conventions, error handling, security patterns

## Change Management

- When you update this file, add a brief entry to `docs/CHANGELOG.md` under Docs/Meta
- Update README.md when making architectural changes to endpoints or deployment
- Document API version changes in API changelog

## Recent Updates

- 2025-12-03T00:00:00.000Z — **API Repo Recalibration Complete**
  - Rewrote copilot instructions to focus on API service role (submodule for website repo)
  - Clarified submodule architecture: this repo consumed by McCals-Website at `src/api/`
  - Updated domain details: `mcc-cal.com` (Squarespace), `api.mcc-cal.com` (Cloudflare Worker with CNAME)
  - Documented: Redis caching, CORS configuration, Cloudflare Worker deployment
  - Integration patterns: how widgets consume API, webhook-based cache invalidation
  - Cleaned up docs/ (removed widget authoring guides) and scripts/ (archived widget-specific utilities)
