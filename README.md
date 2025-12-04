# McCal Media API

REST API service for serving dynamic portfolio data to McCal Media's website widgets and Squarespace integration.

## Overview

This API is a **companion service** to the [McCals-Website](https://github.com/McCal-Codes/McCals-Website) repository. It provides REST endpoints to serve portfolio manifests with Redis caching, CORS configuration for Squarespace domains, and is designed for deployment to Cloudflare Workers/Pages.

**Architecture:**
- **Website Repo**: Generates manifests, hosts widgets, Squarespace integration
- **API Repo (this)**: Serves manifests via REST API with caching and optimization
- **Integration**: Website widgets fetch live data from this API instead of static JSON files

## Key Features

- **REST API**: Versioned endpoints (`/api/v1/`) for manifest retrieval
- **Redis Caching**: In-memory caching layer with configurable TTLs and cache warming
- **CORS Support**: Configured for Squarespace domains and production sites
- **Cloudflare Ready**: Designed for Cloudflare Workers/Pages deployment
- **Health Checks**: Built-in health and monitoring endpoints
- **Webhook Support**: Cache invalidation via webhooks from website repo CI

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Caching**: Redis (via redis-client)
- **Deployment**: Cloudflare Workers or Pages Functions
- **Versioning**: API versioning at `/api/v1/`

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- Redis instance (local or Upstash for Cloudflare)
- Optional: Cloudflare account for production deployment

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Server configuration
API_PORT=3001
NODE_ENV=development

# Redis configuration
REDIS_URL=redis://localhost:6379

# Optional: API security
API_KEY=your-secret-api-key-here
```

### Running the Server

**Development mode (with auto-reload):**
```bash
npm run api:dev
```

**Production mode:**
```bash
npm run api:start
```

The server runs on `http://localhost:3001` by default.

## API Endpoints

### Health Check

**Endpoint:** `GET /api/health` or `GET /api/v1/health`

Returns server health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "redis": "connected"
}
```

### List All Manifest Types

**Endpoint:** `GET /api/v1/manifests`

Returns available manifest types and metadata.

**Response:**
```json
{
  "manifests": ["concert", "events", "journalism", "nature", "portrait", "universal"],
  "count": 6
}
```

### Get Specific Manifest

**Endpoint:** `GET /api/v1/manifests/:type`

Returns a specific portfolio manifest (e.g., `concert`, `events`, `journalism`).

**Response (200):**
```json
{
  "type": "concert",
  "version": "1.0.0",
  "bands": [
    {
      "name": "Band Name",
      "performances": [...]
    }
  ],
  "totalImages": 150,
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

**Response (404):**
```json
{
  "error": "Manifest not found",
  "message": "No manifest found for type: xyz",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Cache Invalidation Webhook

**Endpoint:** `POST /api/v1/webhooks/invalidate-cache`

Invalidates cache for a specific manifest type (requires API key).

**Headers:**
```
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "manifestType": "concert"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cache invalidated for concert",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Integration with Website Widgets

Widgets in the McCals-Website repo can consume this API:

```javascript
// Example: Concert Portfolio Widget
const API_BASE = 'https://api.mcc-cal.com/api/v1';

async function loadManifest() {
  try {
    const response = await fetch(`${API_BASE}/manifests/concert`);
    if (!response.ok) throw new Error('Failed to fetch manifest');
    
    const data = await response.json();
    // Use data.bands, data.totalImages, etc.
    renderPortfolio(data);
  } catch (error) {
    console.error('Manifest load failed:', error);
    // Fallback to static manifest or show error
  }
}
```

## Deployment to Cloudflare

This API is optimized for Cloudflare Workers or Pages Functions:

1. **Install Wrangler CLI:**
   ```bash
   npm install -g wrangler
   ```

2. **Configure `wrangler.toml`:**
   ```toml
   name = "mccal-api"
   main = "src/api/server.js"
   compatibility_date = "2024-01-01"
   
   [env.production]
   route = "api.mcc-cal.com/*"
   
   [[env.production.vars]]
   NODE_ENV = "production"
   ```

3. **Deploy:**
   ```bash
   wrangler publish
   ```

4. **Set up secrets:**
   ```bash
   wrangler secret put REDIS_URL
   wrangler secret put API_KEY
   ```

See `docs/deployment/API-DEPLOYMENT-GUIDE.md` for detailed instructions.

## Caching Strategy

- **Startup**: All manifests are preloaded into Redis cache
- **TTL**: Configurable per manifest type (default: 1 hour for dynamic content, 24 hours for static)
- **Invalidation**: Webhook endpoint allows website repo CI to invalidate cache after manifest updates
- **Fallback**: If Redis is unavailable, API serves directly from file system with warning logs

## Project Structure

```
mccal-api/
├── src/api/
│   ├── server.js              # Express app entry point
│   ├── routes/                # Route handlers
│   │   ├── health.js          # Health check endpoint
│   │   ├── manifests.js       # Manifest CRUD
│   │   ├── blog.js            # Blog/RSS endpoints
│   │   ├── webhooks.js        # Webhook handlers
│   │   └── admin.js           # Admin endpoints
│   ├── versions/v1/           # API v1 router
│   ├── config/                # Configuration
│   │   └── manifests.js       # Manifest type definitions
│   ├── cache/                 # Redis caching
│   │   └── redis-client.js
│   └── proxy-middleware.js    # Proxy utilities
├── scripts/
│   ├── utils/                 # Utilities (cache warming, health checks)
│   ├── admin/                 # Admin scripts (deployment, monitoring)
│   └── manifest/              # Manifest sync utilities
├── docs/
│   ├── deployment/            # Cloudflare deployment guides
│   ├── integrations/          # Widget integration patterns
│   └── standards/             # API conventions, security
├── package.json
└── README.md
```

## Development

### Adding New Endpoints

1. Create route handler in `src/api/routes/` or extend existing file
2. Import and mount in `src/api/versions/v1/index.js`
3. Update CORS origins in `src/api/server.js` if needed
4. Document in `docs/integrations/api-integration-guide.md`
5. Update this README's API Endpoints section

### Testing

```bash
# Start server
npm run api:dev

# Test health endpoint
curl http://localhost:3001/api/health

# Test manifest endpoint
curl http://localhost:3001/api/v1/manifests/concert
```

## CORS Configuration

The API is configured to allow requests from:
- Local development (`localhost:3000`, `localhost:3001`)
- Squarespace domains (`*.squarespace.com`, `*.sqsp.com`)
- Production domain (`mccalmedia.com` and subdomains)

CORS headers include:
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`: GET, POST, PUT, DELETE, OPTIONS
- `Access-Control-Allow-Headers`: Content-Type, Authorization, X-API-Key

## Contributing

See the [McCals-Website](https://github.com/McCal-Codes/McCals-Website) repository for overall project documentation and contribution guidelines.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Related Repositories

- [McCals-Website](https://github.com/McCal-Codes/McCals-Website) — Main website repo with widgets and manifest generators