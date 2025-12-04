# McCal API — Secrets & Variables Setup

This guide walks you through configuring secrets and environment variables required to deploy the McCal API via Cloudflare Workers and GitHub Actions.

## Overview

- Cloudflare Worker Variables (runtime env for the Worker)
- GitHub Repository Secrets (for CI deploy)
- Optional: local preview variables
- Verification steps

No secrets are committed to git. Configure everything via the Cloudflare dashboard and GitHub repo settings.

---

## 1) Cloudflare Worker Variables

Set Worker variables for the production deployment.

Required:
- `ALLOWED_ORIGINS` — comma-separated list of allowed origins used for CORS reflection.
  - Example: `https://mcc-cal.com,https://*.squarespace.com,https://api.mcc-cal.com`

### How to set

Cloudflare Dashboard:
- Go to Workers & Pages → Your Worker (`mccal-api`)
- Settings → Variables
- Add a Variable named `ALLOWED_ORIGINS`
- Value: comma-separated list (no spaces required, spaces are allowed)
- Save

Alternatively using Wrangler (local):
```zsh
# Set variable for deployed worker (requires authenticated wrangler)
wrangler secret put ALLOWED_ORIGINS
# Paste: https://mcc-cal.com,https://*.squarespace.com,https://api.mcc-cal.com
```

Notes:
- Do not hardcode origins in source code; use this variable.
- Wildcards: `*.example.com` will allow subdomains of example.com.

---

## 2) GitHub Repository Secrets (for CI/CD)

Set these secrets in your GitHub repository to allow the deploy workflow to run Wrangler.

Required:
- `CLOUDFLARE_API_TOKEN` — API token with permissions to deploy Workers
- `CLOUDFLARE_ACCOUNT_ID` — Account ID (string) of your Cloudflare account

### Permissions for `CLOUDFLARE_API_TOKEN`
Grant a token with at least:
- Account → Workers Scripts: Edit
- (Optional for future) Account → Workers KV: Edit

### How to set

GitHub:
- Open repository → Settings → Secrets and variables → Actions → New repository secret
- Add `CLOUDFLARE_API_TOKEN` with the value from Cloudflare
- Add `CLOUDFLARE_ACCOUNT_ID` with your account ID

Find Account ID in Cloudflare:
- Dashboard → Account Home → Overview → Account ID

---

## 3) Optional: Local Preview Variables

For local `wrangler dev` you can set env vars via your shell.

```zsh
# macOS zsh example: set for current session
export ALLOWED_ORIGINS="https://mcc-cal.com,https://*.squarespace.com,https://api.mcc-cal.com"

# Start local dev
wrangler dev
```

You can also use a `.env` file for local convenience with tools like direnv. Do not commit secrets.

---

## 4) Verify Configuration

After pushing to `main`, the GitHub Action should deploy.

- Check Actions → Deploy Cloudflare Worker → Logs should show `wrangler deploy` succeeded.
- Visit:
  - `https://api.mcc-cal.com/api/v1/health`
  - Expect `{"status":"ok","timestamp":...}`

### CORS checks
From a browser console or test page hosted at an allowed origin, fetch an API route:
```javascript
fetch('https://api.mcc-cal.com/api/v1/manifests')
  .then(r => r.json())
  .then(console.log)
```
Response headers should include:
- `Access-Control-Allow-Origin: <your origin>`
- `Access-Control-Allow-Methods: GET,OPTIONS`

### Troubleshooting
- 403/401 or deploy failure: ensure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set
- CORS blocked: confirm `ALLOWED_ORIGINS` includes your origin (wildcards allowed)
- DNS: `api.mcc-cal.com` should be routed to the Worker (Wrangler routes configured in `wrangler.toml`)

---

## 5) Reference

- Worker entry: `src/worker.js`
- Wrangler config: `wrangler.toml`
- CI workflow: `.github/workflows/deploy.yml`

Future extensions:
- Add KV/Redis for manifests storage
- Add additional variables (e.g., API_KEY) for privileged endpoints via Cloudflare Variables

