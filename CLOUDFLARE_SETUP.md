# Cloudflare Worker Deployment Setup

This guide helps you configure GitHub Actions to deploy the McCal API Worker.

## 1. Cloudflare Prerequisites

### A. Get Your Credentials

1. **Account ID:**
   - Go to [Cloudflare Dashboard → Overview](https://dash.cloudflare.com/)
   - Your Account ID is displayed on the right sidebar
   - Current Account ID: `2ac16bbf295c2dacf6e2d7c135c8ebdb`

2. **API Token:**
   - Go to [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click **Create Token**
   - Select **Custom token** and configure:
     - **Permissions:**
       - `Account.Workers Scripts` → Read, Write, Publish
       - `Account.KV Storage` → Read, Write
       - `Zone.Workers Routes` → Read, Write
       - `Account.Account Settings` → Read
     - **Account Resources:** Select your account
     - **TTL:** 90 days or custom
   - Copy the token (displayed once)

### B. Create KV Namespace (if not exists)

```sh
export CLOUDFLARE_API_TOKEN=your-token
export CLOUDFLARE_ACCOUNT_ID=2ac16bbf295c2dacf6e2d7c135c8ebdb

wrangler kv:namespace create "MCCAL_KV"
# Returns: { "id": "a93e7efa3f88410fa42b90fec951daff", ... }
```

The KV namespace ID is already in `wrangler.toml`: `a93e7efa3f88410fa42b90fec951daff`

### C. Set Secrets (Optional for GitHub Actions)

If using local deployment, set webhook and JWT secrets:

```sh
wrangler secret put WEBHOOK_SECRET
wrangler secret put BLOG_JWT_SECRET
```

## 2. GitHub Actions Setup

### Add Secrets to Your Repository

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add:
   - **Name:** `CLOUDFLARE_API_TOKEN`  
     **Value:** (your API token from step 1.A)
   - **Name:** `CLOUDFLARE_ACCOUNT_ID`  
     **Value:** `2ac16bbf295c2dacf6e2d7c135c8ebdb`

### (Optional) Add Environment Variables as Secrets

If you want to manage BLOG_AUTHORS or other sensitive vars via GitHub:

- **Name:** `BLOG_AUTHORS_JSON`  
  **Value:** `[{"id":"auth-001","username":"mccal","password":"your-password","name":"McCal"}]`

Then update `wrangler.toml` to reference:
```toml
BLOG_AUTHORS = "${{ env.BLOG_AUTHORS_JSON }}"
```

## 3. Deployment

### Local Deployment

```sh
cd /Users/mccal/Coding\ Shenanigans/McCals-Website/src/api
export CLOUDFLARE_API_TOKEN=your-token
export CLOUDFLARE_ACCOUNT_ID=2ac16bbf295c2dacf6e2d7c135c8ebdb
wrangler deploy
```

### GitHub Actions Deployment

1. Push changes to `main` branch
2. Workflow automatically triggers (or manually dispatch from Actions tab)
3. Check workflow logs in **Actions** tab

## 4. Verify Deployment

```sh
# Test the API
curl https://api.mcc-cal.com/api/v1/blog
curl https://api.mcc-cal.com/api/v1/health
curl https://api.mcc-cal.com/api/v1/manifests
```

Expected responses: JSON with `status: "ok"` and endpoints list.

## 5. Troubleshooting

### Workflow Fails with "Authentication error"

- Verify `CLOUDFLARE_API_TOKEN` is set in GitHub Secrets
- Verify `CLOUDFLARE_ACCOUNT_ID` is set in GitHub Secrets
- Ensure token has required permissions (step 1.A)

### Workflow Fails with "KV namespace not found"

- Ensure KV namespace exists: `wrangler kv:namespace list`
- Update KV namespace ID in `wrangler.toml`

### Worker Returns 500 Error

- Check worker logs: `wrangler tail`
- Verify environment variables in `wrangler.toml` (ALLOWED_ORIGINS, MANIFEST_BASE_URL, etc.)

### Route Not Working (api.mcc-cal.com)

- Ensure token has `Zone.Workers Routes` permission
- Verify zone `mcc-cal.com` exists in Cloudflare
- Check routes in Cloudflare Dashboard → Workers Routes

## Reference

- Wrangler Docs: https://developers.cloudflare.com/workers/wrangler/
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- KV Storage: https://developers.cloudflare.com/workers/runtime-apis/kv/
