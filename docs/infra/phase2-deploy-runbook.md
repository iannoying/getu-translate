# Phase 2 · Production Deploy Runbook

> Executed once at Phase 2 cutover. Reuse the sequence for hotfix redeploys.
>
> Infrastructure: Cloudflare-only (D1 + Workers + Pages). No Vercel, no Neon.

---

## Prereqs

- Cloudflare account with `getutranslate.com` in the zone (confirmed 2026-04-20 via CF Registrar)
- `wrangler` authenticated: `wrangler whoami` should show your account
  ```bash
  wrangler login   # opens browser for OAuth if not already authenticated
  wrangler whoami  # verify — should print account name + ID
  ```
- Node.js ≥ 20 (check with `node -v`; `@cloudflare/next-on-pages` requires Node 20+)
- `pnpm` installed globally (`npm i -g pnpm`)
- Git working tree clean, on `main`:
  ```bash
  git status        # expect: nothing to commit, working tree clean
  git checkout main
  git pull
  ```

---

## 1. Provision D1 Production Database

```bash
wrangler d1 create getu-translate
```

Expected output (example — your `database_id` will differ):

```
✅ Successfully created DB 'getu-translate' in region ENAM
Created your new D1 database.

{
  "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "name": "getu-translate",
  ...
}

[[d1_databases]]
binding = "DB"
database_name = "getu-translate"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` into `apps/api/wrangler.toml` under `[[d1_databases]]`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "getu-translate"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← paste here
```

Commit that change in a follow-up PR (or include it in the same deploy PR if preferred):

```bash
git add apps/api/wrangler.toml
git commit -m "chore(api): set production D1 database_id in wrangler.toml"
```

---

## 2. Apply Initial Schema to Production D1

```bash
wrangler d1 execute getu-translate \
  --remote \
  --file=packages/db/drizzle/0000_init.sql
```

Verify tables were created:

```bash
wrangler d1 execute getu-translate \
  --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected output:

```
┌──────────────┐
│ name         │
├──────────────┤
│ account      │
│ session      │
│ user         │
│ verification │
└──────────────┘
```

If only some tables appear, re-run the migration file — D1 `execute` is idempotent for `CREATE TABLE IF NOT EXISTS` statements.

---

## 3. Deploy `apps/api` to CF Workers

### 3a. Set secrets

```bash
# AUTH_SECRET — paste the output of the openssl command when prompted
pnpm --filter @getu/api exec wrangler secret put AUTH_SECRET
# Prompt: "Enter a secret value:"
# Value to paste: output of → openssl rand -base64 32
```

Verify the secret was set:

```bash
pnpm --filter @getu/api exec wrangler secret list
# Expect: AUTH_SECRET listed
```

### 3b. Set non-secret environment variables

These can also be set via CF Dashboard → Workers & Pages → `getu-api` → Settings → Environment Variables.

```bash
pnpm --filter @getu/api exec wrangler secret put AUTH_BASE_URL
# Value: https://api.getutranslate.com

pnpm --filter @getu/api exec wrangler secret put ALLOWED_EXTENSION_ORIGINS
# Value: https://getutranslate.com,https://www.getutranslate.com,chrome-extension://*
```

> Note: `AUTH_BASE_URL` and `ALLOWED_EXTENSION_ORIGINS` are set as secrets rather than `[vars]` so they can be overridden per-environment without a code deploy.

### 3c. Deploy the Worker

```bash
pnpm --filter @getu/api deploy
```

Expected output ends with:

```
✨  Built successfully
✨  Successfully published your Worker to getu-api.*.workers.dev
```

### 3d. Add custom domain

In CF Dashboard:
1. Workers & Pages → `getu-api` → **Triggers** tab
2. Under **Custom Domains** → **Add Custom Domain**
3. Enter: `api.getutranslate.com`
4. Click **Add Custom Domain** — CF provisions DNS + SSL automatically

Wait for SSL cert provisioning (typically 1–5 min, up to 15 min). Monitor in the Triggers tab — status changes from "Initializing" to "Active".

Verify:

```bash
curl -i https://api.getutranslate.com/health
# Expect: HTTP/2 200
# Body: {"ok":true,"service":"getu-api"}
```

---

## 4. Deploy `apps/web` to CF Pages

### 4a. Configure GitHub Actions secrets

The `Deploy Web` workflow publishes the static `apps/web/out/` directory with Wrangler Pages. Set these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_API_TOKEN` (preferred) or `CLOUDFLARE_API_TOKEN` (fallback)

The Pages token must be scoped to the account that owns `getu-web` and include:

- Account → Cloudflare Pages → Edit

The Worker/D1 deployment token is not enough if it only grants Workers and D1 permissions. If the workflow fails with `Authentication error [code: 10000]` while requesting `/pages/projects/getu-web`, rotate or update the Pages token permission.

### 4b. Build static output

```bash
pnpm --filter @getu/web build:prod
```

This runs `next build` with `NEXT_PUBLIC_API_BASE_URL=https://api.getutranslate.com` and outputs to `apps/web/out/`.

### 4c. Deploy to CF Pages

```bash
pnpm --filter @getu/web exec wrangler pages deploy out \
  --project-name=getu-web
```

First-time deploy will prompt to create the project if it doesn't exist in CF — confirm with `y`.

### 4d. Add custom domains

In CF Dashboard:
1. Workers & Pages → `getu-web` → **Custom domains** tab
2. Add both:
   - `getutranslate.com`
   - `www.getutranslate.com`

### 4e. Production API URL

`NEXT_PUBLIC_API_BASE_URL` is baked into the static bundle at build time. Do not rely on Cloudflare Pages runtime environment variables for an already-built `out/` directory. Rebuild before redeploying:

```bash
pnpm --filter @getu/web build:prod
pnpm --filter @getu/web exec wrangler pages deploy out \
  --project-name=getu-web
```

---

## 5. DNS Sanity Checks

CF handles DNS automatically when you add custom domains through the dashboard, but verify propagation:

```bash
# Workers custom domain
dig +short api.getutranslate.com
# Expect: one or more CF anycast IPs (e.g., 104.x.x.x or 2606:4700:...)

# Pages custom domains
dig +short getutranslate.com
dig +short www.getutranslate.com
# Expect: CF anycast IPs (same range)
```

If `dig` returns nothing after 5 minutes, check the CF Dashboard DNS tab — the A/AAAA records should be auto-created as CF-proxied (orange cloud).

Full HTTPS check:

```bash
curl -si https://api.getutranslate.com/health | head -5
# Expect: HTTP/2 200

curl -si https://getutranslate.com | head -5
# Expect: HTTP/2 200 (or 307 redirect to /log-in)

curl -si https://www.getutranslate.com | head -5
# Expect: HTTP/2 200 (or 301 redirect to non-www)
```

---

## 6. Production Smoke Test (End-to-End)

Run these in order to exercise the full user → extension → API path.

### 6.1 Web sign-up / sign-in

1. Open `https://getutranslate.com/log-in` in a fresh browser tab (or incognito).
2. Sign up with a test email address via the form.
3. After sign-in, verify in DevTools → Application → Cookies → `getutranslate.com`:
   - A `better-auth.session_token` cookie (or similar) is set for domain `.getutranslate.com`.
   - Cookie `httpOnly: true`, `secure: true`, `sameSite: None` (required for cross-origin extension use).

### 6.2 Extension round-trip

4. Load the production extension build in Chrome (via `chrome://extensions` → **Load unpacked** or install the published zip).
5. Open extension **Options → Account** page.
6. Verify that `useEntitlements` returns `{ tier: "free", ... }` — visible in DevTools → Network → filter by `orpc` and inspect the response from `https://api.getutranslate.com/orpc/...`.

### 6.3 Optional: manual pro-tier flip

```bash
wrangler d1 execute getu-translate \
  --remote \
  --command="UPDATE user SET tier='pro' WHERE email='<test-email@example.com>'"
```

Reload the extension Options page and confirm `useEntitlements` now returns `{ tier: "pro" }` and the M2 `useInputTranslationQuota` short-circuit engages.

Reset after testing:

```bash
wrangler d1 execute getu-translate \
  --remote \
  --command="UPDATE user SET tier='free' WHERE email='<test-email@example.com>'"
```

---

## 7. Gotchas + Follow-ups

> Fill these in during and after the real deploy. Placeholders below reflect known risks.

### 7.1 D1 binding ID must match exactly

The `database_id` in `apps/api/wrangler.toml` must match the ID returned by `wrangler d1 create`. A mismatch causes silent D1 binding failure at runtime (Worker starts but all DB queries fail with `DB is not defined`). Double-check with:

```bash
wrangler d1 list
# Verify "getu-translate" and its uuid match wrangler.toml
```

### 7.2 `next-on-pages` build quirks

- Requires Node.js ≥ 20. Document whichever version works: `node -v` → **paste here after real deploy**.
- All Next.js routes in `apps/web` must use the **Edge runtime** (`export const runtime = 'edge'`). Node.js runtime routes will fail the build.
- If `next-on-pages` fails, check `@cloudflare/next-on-pages` release notes for version compatibility with Next.js 15.x.
- Fallback: convert `apps/web` to a static export (`output: 'export'` in `next.config.ts`) and deploy as static assets — functional for Phase 2's single form page.

### 7.3 Custom domain SSL cert timing

CF can take 1–15 minutes to provision TLS for custom domains. Do not mark the deploy done until `curl -i https://api.getutranslate.com/health` returns `200`. Run in a watch loop if desired:

```bash
watch -n 10 'curl -si https://api.getutranslate.com/health | head -2'
```

### 7.4 `AUTH_BASE_URL` must be production URL before deploy

If you deploy the Worker with `AUTH_BASE_URL = http://localhost:8788` (the dev default in `wrangler.toml`), all better-auth cookie domains will be wrong. Confirm the secret is overriding the var:

```bash
pnpm --filter @getu/api exec wrangler secret list
# AUTH_BASE_URL and ALLOWED_EXTENSION_ORIGINS must appear
```

### 7.5 Session cookie domain for extension

The extension's `backgroundFetch` proxy sets `Origin: https://getutranslate.com`. Verify better-auth issues the cookie with `domain=.getutranslate.com` (note leading dot). If the cookie is scoped to `api.getutranslate.com` only, the web app won't read it. Inspect the `Set-Cookie` header:

```bash
curl -v https://api.getutranslate.com/api/auth/sign-in/email 2>&1 | grep -i set-cookie
```

### 7.6 Chrome Web Store re-submission

After Phase 2 goes live (production `api.getutranslate.com` endpoint hardcoded in extension build), the extension needs a new CWS submission. This is a separate task — track as a GitHub issue after the first user report or at Phase 3 kickoff.

### 7.7 PostHog

Phase 2 does not wire PostHog. Phase 3 will add event tracking. No action needed here.

### 7.8 Rollback

To rollback `apps/api`: redeploy the previous git SHA.

```bash
git checkout <previous-sha> -- apps/api/
pnpm --filter @getu/api deploy
```

To rollback `apps/web`: use CF Dashboard → Pages → `getu-web` → **Deployments** → pick previous deployment → **Rollback to this deployment**.

D1 schema rollback: not supported natively. If a migration was applied, restore from a manual snapshot taken via `wrangler d1 export` before the deploy (see below).

### 7.9 Pre-deploy D1 snapshot (recommended)

Before applying migrations to an already-populated production D1, export a backup:

```bash
wrangler d1 export getu-translate --remote --output=backup-$(date +%Y%m%d-%H%M%S).sql
```

---

## Reference Links

- CF D1 docs: <https://developers.cloudflare.com/d1/>
- CF Workers custom domains: <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- CF Pages custom domains: <https://developers.cloudflare.com/pages/configuration/custom-domains/>
- `@cloudflare/next-on-pages`: <https://github.com/cloudflare/next-on-pages>
- Wrangler CLI reference: <https://developers.cloudflare.com/workers/wrangler/commands/>
- better-auth docs: <https://www.better-auth.com/docs>
