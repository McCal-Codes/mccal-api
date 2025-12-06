# API Roadmap & TODOs

This file tracks upcoming improvements for the McCal API (Cloudflare Workers).

Legend: [ ] not started · [x] done · [~] in progress · [b] blocked

## High-Impact Enhancements

- [ ] Workers AI at the Edge
  - [ ] Bind Workers AI (`env.AI`) in wrangler and Worker
  - [ ] Alt-text generation pipeline for images
  - [ ] Whisper-based captions for audio/podcast
  - [ ] Text summarizers for articles (LLaMA)
  - [ ] Embeddings for descriptor tags (image URLs / article tagging)
  - [ ] Minimal endpoints to invoke AI (`/api/v1/ai/*`)

- [ ] Edge Analytics (Workers Analytics)
  - [ ] Enable analytics collection (per-route, latency, errors)
  - [ ] Add route tags/metadata where useful
  - [ ] Document dashboard navigation and segments

- [ ] Zero Trust Access (Private Admin APIs)
  - [ ] Configure Cloudflare Access for Google/GitHub login
  - [ ] Protect `/api/v1/admin/*` endpoints
  - [ ] Admin utilities: regenerate manifests, trigger builds, update metadata, review logs

- [ ] Cache Everything Globally
  - [ ] Formalize TTL strategy (5s–1d) by endpoint
  - [ ] Ensure caches.default + `Cache-Control` headers consistent
  - [ ] Consider `stale-if-error` policy for resilience

- [ ] Cron Triggers
  - [ ] Set scheduled tasks (minute/hour/day) via Wrangler
  - [ ] Jobs: refresh manifest caches, backup data, auto-refresh external APIs
  - [ ] Trending topics updater for political journalism pages

- [ ] Transform Rules
  - [ ] URL rewrites (e.g., `/p/123` → `/portfolio/123`)
  - [ ] Headers: compression, HTTPS enforcement, SEO cleanup
  - [ ] Bot redirects / query param sanitization

- [ ] Pages + Workers Hybrid
  - [ ] Explore migrating `studio.mcc-cal.com`, `blog.mcc-cal.com`, `archive.mcc-cal.com` to Cloudflare Pages
  - [ ] Integrate Workers for dynamic API/auth/comments/likes/blog engine/podcast feeds

- [ ] Cloudflare Backend Stack
  - [ ] R2 (image storage)
  - [ ] KV (caching/state)
  - [ ] D1 (SQLite DB)
  - [ ] Queues (background tasks)
  - [ ] WAF & Zero Trust policies consolidated

## Current Worker Improvements (Status)

- [x] Root index + aliases (`/`, `/api`, `/api/v1`)
- [x] Manifest fetch via `MANIFEST_BASE_URL` with edge caching
- [x] Env-driven manifest types (`MANIFEST_TYPES`) or defaults
- [x] CORS via `ALLOWED_ORIGINS`
- [x] ETag fallback (weak ETag when upstream missing)
- [x] Cache-Control: `public, max-age=300, stale-while-revalidate=3600`
- [x] Request ID header (`X-Request-Id`) on all responses
- [x] CI smoke tests (GitHub Actions)
- [x] Local smoke script
- [ ] Cache purge webhook (`POST /api/v1/webhooks/invalidate-cache`)
- [ ] Health enrichment (upstream reachability)
- [ ] `stale-if-error` caching
- [ ] Dynamic type discovery via `${MANIFEST_BASE_URL}/index.json`
- [ ] Rate limiting (optional)

## Operational Fixes (Dec 2025)

- [ ] Remove Cloudflare Tunnel DNS record for `dev.mcc-cal.com`.
- [ ] Add proxied CNAME for `dev.mcc-cal.com` pointing to the chosen dev origin (e.g., worker `mccal-api.mccal.workers.dev` or other dev host).
- [ ] Publish worker so updated `ALLOWED_ORIGINS` (including `https://dev.mcc-cal.com` and localhost) are active.
- [ ] Optional: add temporary `/etc/hosts` entry `127.0.0.1 dev.mcc-cal.com` for local testing, then remove.
- [ ] Verify after DNS propagation: `curl -I https://dev.mcc-cal.com` returns origin headers (not 1033) and dev front-end requests succeed with CORS.

## Notes

- Keep secrets/vars in Cloudflare (no source control secrets).
- Prefer Worker-native APIs (no Node-only modules).
- Document each feature in `docs/` and update `README.md` accordingly.
