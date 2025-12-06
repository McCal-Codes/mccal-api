# GitHub Actions Setup for Cloudflare Worker Deployment

## Quick Checklist

This guide walks you through enabling automated Cloudflare Worker deployment via GitHub Actions.

### ✅ Step 1: Get Your Cloudflare Credentials

**Your Account ID (already configured):**
```
2ac16bbf295c2dacf6e2d7c135c8ebdb
```

**Your API Token (already generated):**
```
bZ9xgH9Qu4FiuMq3tjn4GvtfpPk3D3yqcjMDQRpF
```

> **⚠️ IMPORTANT:** Keep this token private. Only add it to GitHub Secrets, never commit it to the repository.

---

### ✅ Step 2: Add GitHub Secrets (ONE TIME ONLY)

1. **Open your GitHub repository**
   - Navigate to: `https://github.com/McCal-Codes/McCals-Website`

2. **Go to Settings**
   - Click the **Settings** tab at the top

3. **Navigate to Secrets**
   - Left sidebar → **Secrets and variables** → **Actions**

4. **Create First Secret: `CLOUDFLARE_API_TOKEN`**
   - Click **New repository secret**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: `bZ9xgH9Qu4FiuMq3tjn4GvtfpPk3D3yqcjMDQRpF`
   - Click **Add secret**

5. **Create Second Secret: `CLOUDFLARE_ACCOUNT_ID`**
   - Click **New repository secret**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: `2ac16bbf295c2dacf6e2d7c135c8ebdb`
   - Click **Add secret**

6. **Verify Secrets Are Added**
   - You should see both secrets listed with ✓ checkmarks
   - They will be masked in GitHub Actions logs for security

---

### ✅ Step 3: Test the Workflow

**Option A: Automatic (Next Push)**
```bash
cd src/api
echo "# Test comment" >> README.md
git add README.md
git commit -m "Test GitHub Actions deployment"
git push origin main
```

**Option B: Manual Trigger**
1. Go to your GitHub repo
2. Click **Actions** tab
3. Select **Deploy Cloudflare Worker** workflow
4. Click **Run workflow** → **Run workflow** button

---

### ✅ Step 4: Monitor Deployment

1. **Watch the Workflow**
   - Click the workflow run from the Actions tab
   - Watch for green checkmarks ✓

2. **Expected Output**
   ```
   ✓ Cloudflare credentials validated
   ✓ Deploy to Cloudflare Workers
   ✓ API health check passed
   ```

3. **If it Fails**
   - Click the failed step to expand
   - Common errors:
     - **"Missing Cloudflare credentials"**: Secrets not added properly
     - **"Unauthorized"**: Token permissions insufficient (check token at https://dash.cloudflare.com/)
     - **"HTTP 500"**: Worker code issue (check logs with `wrangler tail`)

---

## Manual Deployment (Backup)

If GitHub Actions fails, you can deploy manually:

```bash
cd /Users/mccal/Coding\ Shenanigans/McCals-Website/src/api

# Set environment variables
export CLOUDFLARE_API_TOKEN="bZ9xgH9Qu4FiuMq3tjn4GvtfpPk3D3yqcjMDQRpF"
export CLOUDFLARE_ACCOUNT_ID="2ac16bbf295c2dacf6e2d7c135c8ebdb"

# Deploy
npm run deploy

# Or with wrangler directly:
npx wrangler deploy --config wrangler.toml
```

---

## Verify Deployment Success

Once deployed, test the API:

```bash
# Check health endpoint
curl https://api.mcc-cal.com/api/v1/health

# Expected response (200 OK):
# {
#   "status": "ok",
#   "endpoints": [...],
#   "timestamp": "2025-12-06T..."
# }
```

---

## Troubleshooting

### ❌ "Unauthorized" Error
**Problem:** API token lacks permissions
**Solution:** 
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click the token to edit it
3. Ensure it has permissions for:
   - Account: Workers Scripts (Read & Write)
   - Account: KV (Read & Write)
   - Account: Workers Routes (Read & Write)
   - Zone: All zones (for DNS operations)

### ❌ "Failed to fetch secrets"
**Problem:** GitHub Secrets not configured
**Solution:**
1. Verify secrets exist in GitHub Settings → Secrets
2. Check secret names match exactly: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
3. Re-add secrets if uncertain

### ❌ Worker deployment succeeds but API returns 404
**Problem:** Routes not registered properly
**Solution:**
1. Check wrangler.toml routes configuration
2. Verify zone `mcc-cal.com` exists in Cloudflare account
3. Check DNS routing:
   ```bash
   curl -I https://api.mcc-cal.com/api/v1/health
   ```

### ❌ "API health check failed"
**Problem:** Worker deployed but not responding
**Solution:**
1. View worker logs:
   ```bash
   wrangler tail --format pretty
   ```
2. Check for runtime errors in worker.js
3. Verify KV namespace binding in wrangler.toml

---

## What Happens Next?

Once GitHub Actions secrets are configured:

1. **Every push to main** that touches `src/api/` will:
   - Install dependencies
   - Run syntax validation
   - Deploy to Cloudflare
   - Test the API health endpoint

2. **Within 2-3 minutes**, your changes will be live at:
   - https://api.mcc-cal.com/*
   - https://mccal-api.mccal.workers.dev/*

3. **You can monitor** the deployment status in the Actions tab

---

## For Future Agents

- **Credentials are GitHub Secrets**, not in code
- **Deployment is automatic** on push to main (no manual `wrangler deploy` needed)
- **Workflow file:** `/src/api/.github/workflows/deploy.yml`
- **Config file:** `/src/api/wrangler.toml`
- **Main worker:** `/src/api/src/worker.js`

---

**Last Updated:** 2025-12-06
**Status:** ✅ Ready for GitHub Actions setup
