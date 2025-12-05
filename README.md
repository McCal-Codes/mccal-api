# McCal Media API

RESTful API server for serving portfolio data, manifests, and media assets. Designed to integrate with the existing static site and Squarespace widgets.

## Features

- 🚀 Express.js-based REST API
- 📦 In-memory caching with configurable TTL
- 🔒 CORS configuration for Squarespace integration
- 💚 Health check endpoints for monitoring
- 📊 Manifest serving with cache control
- 🛡️ Error handling and request logging

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Cloudflare account (for Worker deployment)

### Installation

```bash
# Install dependencies
npm install
```

### Running the Server

**Express (Node.js) API:**

```bash
# Start the server (production mode)
npm run start

# Start with auto-reload (development mode)
npm run dev

# Or specify custom port
API_PORT=3011 NODE_ENV=development npm run dev
```

The Express API will be available at `http://localhost:3011` (or your configured `API_PORT`).

**Cloudflare Worker (local dev):**

```bash
# Local mode (no remote bindings)
npm run cf:dev

# Remote mode (connects to Cloudflare account for KV/DO/etc.)
npm run cf:dev:remote
```

The Worker dev server runs at `http://127.0.0.1:8787`.

**Available npm scripts:**

- `npm run start` – Start Express server (reads `API_PORT`, defaults to 3001)
- `npm run dev` – Start Express with auto-reload (`--watch`)
- `npm run cf:dev` – Cloudflare Worker local dev (port 8787, no remote bindings)
- `npm run cf:dev:remote` – Cloudflare Worker dev with live account bindings
- `npm run cf:deploy` – Deploy Worker to production (requires auth)
- `npm run cf:tail` – Stream production Worker logs

## API Endpoints

### Root

```
GET /
```

Returns API information and available endpoints.

**Response:**

```json
{
  "name": "McCal Media API",
  "version": "1.0.0",
  "status": "running",
  "endpoints": {
    "health": "/api/health",
    "v1": {
      "health": "/api/v1/health",
      "manifests": "/api/v1/manifests"
    }
  }
}
```

### Health Checks

#### Basic Health Check

```
GET /api/health
```

Returns server health status and basic metrics.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-11-21T18:00:00.000Z",
  "uptime": 123.456,
  "memory": {
    "used": 7,
    "total": 9,
    "unit": "MB"
  }
}
```

#### Detailed Health Check

```
GET /api/health/detailed
```

Returns comprehensive health status including dependency checks.

#### Readiness Probe

```
GET /api/health/ready
```

For Kubernetes/container orchestration readiness checks.

#### Liveness Probe

```
GET /api/health/live
```

For Kubernetes/container orchestration liveness checks.

### Manifests

#### List All Manifests

```
GET /api/v1/manifests
```

Returns a list of all available manifest types.

**Response:**

```json
{
  "manifests": [
    {
      "type": "concert",
      "endpoint": "/api/v1/manifests/concert"
    },
    {
      "type": "events",
      "endpoint": "/api/v1/manifests/events"
    }
    // ... more manifests
  ],
  "total": 7,
  "cacheStatus": {
    "cached": 3,
    "ttl": "5 minutes"
  }
}
```

#### Get Specific Manifest

```
GET /api/v1/manifests/:type
```

Returns manifest data for a specific portfolio type.

**Available Types:**

- `concert` - Concert photography portfolio
- `events` - Events photography portfolio
- `journalism` - Photojournalism portfolio
- `nature` - Nature photography portfolio
- `portrait` - Portrait photography portfolio
- `featured` - Featured work portfolio
- `universal` - Universal/combined portfolio

**Response:**

```json
{
  "type": "concert",
  "data": {
    "bands": [...],
    "totalBands": 16,
    "generated": "2025-11-21T18:00:00.000Z",
    "version": "2.0"
  },
  "meta": {
    "timestamp": "2025-11-21T18:00:00.000Z",
    "cached": false
  }
}
```

**Response Headers:**

- `X-Cache: HIT` - Data served from cache
- `X-Cache: MISS` - Data read from filesystem
- `X-RateLimit-Limit` - Maximum requests per window
- `X-RateLimit-Remaining` - Remaining requests in current window
- `X-RateLimit-Reset` - Timestamp when rate limit resets
- `ETag` - Entity tag for conditional requests
- `Cache-Control` - Caching directives (10 min TTL, 1 hour stale-while-revalidate)

### Cache Management

#### Get Cache Statistics

```
GET /api/v1/cache/stats
```

Returns cache hit/miss statistics.

**Response:**

```json
{
  "hits": 1234,
  "misses": 56,
  "purges": 3,
  "warms": 6,
  "hitRate": "95.7%",
  "uptimeMs": 3600000,
  "lastReset": "2025-12-05T10:00:00.000Z"
}
```

### Webhooks (Cache Invalidation)

All webhook endpoints require `X-Webhook-Secret` header authentication.

#### Purge Specific Cache

```
POST /api/v1/webhooks/purge/:type
```

Purges edge cache for a specific manifest type.

**Response:**

```json
{
  "success": true,
  "action": "purge",
  "type": "concert",
  "deleted": true,
  "timestamp": "2025-12-05T18:00:00.000Z"
}
```

#### Purge All Caches

```
POST /api/v1/webhooks/purge
```

Purges edge cache for all manifest types.

#### Warm Specific Cache

```
POST /api/v1/webhooks/warm/:type
```

Pre-warms edge cache for a specific manifest type by fetching fresh data.

#### Warm All Caches

```
POST /api/v1/webhooks/warm
```

Pre-warms edge cache for all manifest types.

#### Refresh (Purge + Warm)

```
POST /api/v1/webhooks/refresh
```

Combined operation: purges all caches then warms them with fresh data. Used by CI/CD after manifest publishing.

**Response:**

```json
{
  "success": true,
  "action": "refresh",
  "purge": {
    "purged": 6,
    "total": 6
  },
  "warm": {
    "warmed": 6,
    "cached": 0,
    "failed": 0,
    "total": 6
  },
  "timestamp": "2025-12-05T18:00:00.000Z"
}
```

#### Clear Manifest Cache (Legacy)

```
POST /api/v1/manifests/cache/clear
```

Clears the in-memory manifest cache. Useful during development.

**Response:**

```json
{
  "message": "Cache cleared successfully",
  "clearedCount": 3,
  "timestamp": "2025-11-21T18:00:00.000Z"
}
```

## Configuration

### Environment Variables

Create a `.env` file in the API root directory (see `.env.example`):

```bash
# Server Configuration
API_PORT=3011
NODE_ENV=development

# CORS Configuration (comma-separated)
ALLOWED_ORIGINS=https://mcc-cal.com,https://www.mcc-cal.com,*.squarespace.com

# Redis (optional, for persistent caching)
REDIS_URL=redis://localhost:6379

# Cache Configuration
CACHE_TTL_SECONDS=600          # 10 minute TTL for manifests
RATE_LIMIT_REQUESTS=100        # Max requests per window
RATE_LIMIT_WINDOW_MS=60000     # 1 minute window

# Secrets (use wrangler secret put for Cloudflare Worker)
JWT_SECRET=your-secret-here
WEBHOOK_SECRET=your-webhook-secret
```

**Note**: Your `server.js` reads `API_PORT` (not `PORT`). Use `API_PORT` when starting the Express API locally.

For Cloudflare Worker, use `wrangler.toml` vars or `wrangler secret put` for sensitive values:

```bash
# Set secrets for Cloudflare Worker
cd src/api
npx wrangler secret put JWT_SECRET
npx wrangler secret put WEBHOOK_SECRET
```

### CORS Configuration

By default, the API allows requests from:

- `localhost:3000` and `localhost:3001` (local development)
- `*.squarespace.com` (Squarespace preview)
- `*.sqsp.com` (Squarespace CDN)
- Custom domains matching `/mccalmedia\.com$/`

To add more origins, modify the `corsOptions` in `server.js`.

## Caching

### Edge Caching (Cloudflare Worker)

The Worker uses Cloudflare's edge cache with the following policy:

| Resource Type | TTL | Stale-While-Revalidate | Notes |
|--------------|-----|------------------------|-------|
| Manifests | 10 min | 1 hour | ETag validation supported |
| Blog posts | 1 hour | 2 hours | Less volatile content |

**Key features:**

- **ETag revalidation**: Clients can use `If-None-Match` header for conditional requests
- **Stale-while-revalidate**: Serve stale content while fetching fresh data in background
- **Cache hit/miss headers**: `X-Cache: HIT` or `X-Cache: MISS`

### Rate Limiting

Manifest endpoints are protected by per-IP rate limiting:

- **Limit**: 100 requests per minute (configurable via `RATE_LIMIT_REQUESTS`)
- **Window**: 60 seconds (configurable via `RATE_LIMIT_WINDOW_MS`)
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Exceeded**: Returns 429 with `Retry-After: 60` header

### In-Memory Caching (Express API)

The Express API implements in-memory caching for manifest data:

- **Default TTL:** 5 minutes
- **Cache Strategy:** LRU (Least Recently Used)
- **Cache Key:** Manifest type (concert, events, etc.)

Cache can be cleared manually via the `/api/v1/manifests/cache/clear` endpoint.

## Error Handling

All errors return a consistent JSON format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2025-11-21T18:00:00.000Z"
}
```

Common status codes:

- `200` - Success
- `404` - Resource not found
- `403` - CORS error
- `500` - Internal server error

## Development

### Project Structure

```
src/api/
├── server.js                # Main server entry point
├── routes/
│   ├── health.js           # Health check endpoints (non-versioned alias)
│   └── manifests.js        # Manifest endpoints
├── versions/
│   └── v1/
│       ├── index.js        # v1 router aggregator (/api/v1/*)
│       └── health.js       # v1 health routes (/api/v1/health)
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

### Adding New Routes

1. Create a new route file in `routes/`:

```javascript
// routes/myroute.js
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "Hello!" });
});

module.exports = router;
```

2. Import and use in `server.js`:

```javascript
const myRoute = require("./routes/myroute");
const v1 = require("./versions/v1");
v1.use("/myroute", myRoute);
app.use("/api/v1", v1);
```

### Testing

**Express API:**

```bash
# Health check (alias)
curl http://localhost:3011/api/health

# Health check (versioned)
curl http://localhost:3011/api/v1/health

# List manifests
curl http://localhost:3011/api/v1/manifests

# Get specific manifest
curl http://localhost:3011/api/v1/manifests/concert

# With pretty JSON output
curl -s http://localhost:3011/api/health | jq
```

**Cloudflare Worker (dev):**

```bash
# Health check
curl http://127.0.0.1:8787/api/v1/health

# List manifests
curl http://127.0.0.1:8787/api/v1/manifests

# Get specific manifest
curl http://127.0.0.1:8787/api/v1/manifests/concert
```

**Production (Cloudflare):**

```bash
# Health check
curl https://api.mcc-cal.com/api/v1/health

# List manifests
curl https://api.mcc-cal.com/api/v1/manifests

# Get specific manifest
curl https://api.mcc-cal.com/api/v1/manifests/concert
```

## Integration with Widgets

To consume the API from widgets:

```javascript
// Fetch manifest data
async function loadPortfolio() {
  try {
    const response = await fetch(
      "http://localhost:3001/api/v1/manifests/concert"
    );
    const { data } = await response.json();

    // Use the data
    console.log("Bands:", data.bands);
  } catch (error) {
    console.error("Failed to load portfolio:", error);
    // Fallback to static manifest
  }
}
```

### Supported Widgets

The following widgets support optional API loading via `data-api="on"`:

- **Concert Portfolio v4.7.1** - `/api/v1/manifests/concert`
  - File: `src/widgets/concert-portfolio/versions/v4.7.1-api-optional.html`
  - Data shape: `response.data.bands[]`

For implementation details and patterns to add API support to other widgets, see:

- `docs/integrations/api-integration-guide.md`

## Frontend integration in local development (proxy)

During local development, you can avoid CORS and use same-origin calls via the dev server proxy:

```bash
# Start site + API together with proxy enabled
npm run dev:with-api
```

- The site runs at http://localhost:3000 and proxies /api/\* to http://localhost:3001
- In the browser, call relative endpoints like `/api/v1/manifests/concert`
- Example (inside client code):

```javascript
const res = await fetch("/api/v1/manifests/concert");
const { data } = await res.json();
```

If the API is down, implement a graceful fallback to static manifests to keep widgets functional.

## Deployment

### Cloudflare Worker (Recommended)

Deploy to Cloudflare Workers for global edge distribution:

```bash
# Login once
npx wrangler login

# Deploy to production
npm run cf:deploy

# View logs
npm run cf:tail
```

**Setup:**

1. Create a Cloudflare API token (Workers/Pages Deploy scope)
2. Store as `CLOUDFLARE_API_TOKEN` in GitHub repo secrets
3. Configure `wrangler.toml` with your account ID and zone name
4. Bind `api.mcc-cal.com` as a Custom Domain in Cloudflare Dashboard
5. Deploy via GitHub Actions or manually with `wrangler deploy`

**Secrets:**

```bash
# Set production secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put REDIS_URL
```

### Express (Docker/VPS)

Use the included Dockerfile or deploy to your preferred Node hosting:

**Option 1: Container Deployment**

- **Railway** - Simple container hosting
- **Fly.io** - Global edge deployment
- **Render** - Zero-config Node.js hosting

**Option 2: Traditional VPS**

- Use PM2 for process management
- Configure nginx as reverse proxy
- Set up SSL/TLS certificates with Let's Encrypt

**Option 3: Serverless Functions**

- **Netlify Functions** - Easy Squarespace integration
- **Vercel Serverless** - Zero-config deployment
- **AWS Lambda** - Scalable, pay-per-use

See the parent repo's `docs/integrations/cloudflare-api-setup.md` for detailed Cloudflare routing, CORS config, and CI/CD setup.

## Roadmap

- [ ] Authentication & API keys
- [ ] Rate limiting per client
- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] Image optimization endpoints
- [ ] GraphQL interface
- [ ] WebSocket support for real-time updates
- [ ] OpenAPI/Swagger documentation
- [ ] Performance metrics & monitoring

## Troubleshooting

### Port Already in Use

If port 3001 (or your configured `API_PORT`) is already in use:

```bash
# Find process using port 3001
lsof -ti:3001

# Kill the process
kill -9 $(lsof -ti:3001)

# Or change the port
API_PORT=3011 npm run start
```

**Note**: Your `server.js` reads `API_PORT`, not `PORT`. Set `API_PORT=<port>` when starting the Express API.

### CORS Errors

If you see CORS errors in the browser console:

1. Check that the origin is allowed in `corsOptions` (server.js)
2. Ensure credentials are properly configured
3. In development, all origins are allowed by default

### Manifest Not Found

If manifests return 404:

```bash
# Generate all manifests
npm run manifest:generate

# Verify manifest files exist
ls -la src/images/Portfolios/Concert/concert-manifest.json
```

## License

MIT - See LICENSE file in repository root

## Support

For issues, questions, or contributions, please refer to the main repository documentation.

---

**Version:** 1.0.0  
**Last Updated:** 2025-11-21
