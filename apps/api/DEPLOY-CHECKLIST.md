# @getu/api — Production Deploy Checklist

This is the canonical list of Cloudflare resources that must exist before deploying. If any item is missing, deploy WILL fail at runtime even if CI is green. **Treat this file as a tripwire — every PR that adds a new binding must update this file.**

## D1 Database

- Binding: `DB`
- Database name: `getu-translate`
- Database id: `903fa2ef-2aaa-4f20-b3a7-a2ef59a8cb70`
- Migrations: `packages/db/drizzle/`
- How to apply: `cd apps/api && pnpm exec wrangler d1 migrations apply DB --remote`
- **CI gate**: workflow runs `wrangler d1 migrations apply` BEFORE `wrangler deploy`

## R2 Buckets

| Binding | Name | Purpose | Created via |
|---|---|---|---|
| `BUCKET_PDFS` | `getu-pdfs` | PDF source + output blobs | `wrangler r2 bucket create getu-pdfs` |

## KV Namespaces

| Binding | Purpose | Created via |
|---|---|---|
| `RATE_LIMIT_KV` | Edge rate limit fixed-window counters (M7-A2). Fail-open if missing — middleware logs `console.warn` and lets requests through, so `wrangler dev` doesn't break before namespace is created. | `wrangler kv namespace create RATE_LIMIT_KV` |

**One-time setup before merging M7-A2 to production:**

```bash
cd apps/api
pnpm exec wrangler kv namespace create RATE_LIMIT_KV
pnpm exec wrangler kv namespace create RATE_LIMIT_KV --env production
```

Paste the returned `id` values into `wrangler.toml` (replace `PLACEHOLDER_DEV_KV_ID` / `PLACEHOLDER_PROD_KV_ID`) for both the default and `[env.production]` blocks, commit + push as a fast-follow.

**Verification post-deploy:** Curl `/orpc/billing.getEntitlements` 31 times from the same IP within 60 seconds (no auth cookie). The 31st should return `429` with `Retry-After`.

## Queues

| Binding | Name | Producer | Consumer | Created via |
|---|---|---|---|---|
| `TRANSLATE_QUEUE` | `getu-translate-jobs` | `documentCreate` / `documentRetry` / `documentFromUrl` | `worker.ts queue handler` (M6.9) | `wrangler queues create getu-translate-jobs` |

## Required Secrets (`wrangler secret put`)

| Name | Purpose |
|---|---|
| `AUTH_SECRET` | better-auth session signing |
| `AI_JWT_SECRET` | AI proxy JWT signing |
| `BIANXIE_API_KEY` | LLM proxy API key |
| `R2_ACCOUNT_ID` | R2 S3-compat presigned URL signing |
| `R2_ACCESS_KEY_ID` | R2 S3-compat presigned URL signing |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compat presigned URL signing |
| `R2_BUCKET_PDFS_NAME` | R2 S3-compat presigned URL signing |
| `RESEND_API_KEY` | Email sender (better-auth email-otp) |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verify |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe price ID |
| `STRIPE_PRICE_CNY_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_CNY_YEARLY` | Stripe price ID |
| `GITHUB_CLIENT_ID` | OAuth |
| `GITHUB_CLIENT_SECRET` | OAuth |
| `GOOGLE_CLIENT_ID` | OAuth |
| `GOOGLE_CLIENT_SECRET` | OAuth |
| `POSTHOG_PROJECT_KEY` | Server-side analytics; **absent in env = silent no-op (analytics off)**. Required if you want event capture in PostHog. |
| `POSTHOG_HOST` | Optional. Defaults to `https://us.i.posthog.com`. Set to `https://eu.i.posthog.com` for EU residency. |
| `SENTRY_DSN` | Error capture; **absent in env = silent no-op (Sentry off)**. Required for production error monitoring. |
| `RATE_LIMIT_SMOKE_SECRET` | Optional. M7-A2 rate-limit bypass for CI smoke tests. **Closed-by-default** — if unset, the `X-Internal-Smoke` header has no effect. Set only if CI runs end-to-end probes against the live API. |

To verify all secrets are set:

```bash
cd apps/api && pnpm exec wrangler secret list | grep -c '"name"'
# Expected: 17+ (lines, all non-empty)
```

## Cron Triggers

Configured in `wrangler.toml`:
- `0 3 * * *` daily — runs `runRetention`, `runTranslationCleanup`, `runTranslationStuckSweep`, `runTranslationRetry`

To trigger manually for testing: Cloudflare Dashboard → Workers → getu-api → Triggers → Cron Triggers → "Trigger".

## R2 Lifecycle Rules (Cloudflare Dashboard)

For bucket `getu-pdfs`:

| Rule name | Prefix | Action | After |
|---|---|---|---|
| `pdfs-fallback-cleanup` | `pdfs/` | Delete uploaded objects | 180 days |

This is a safety net — M6.12 cleanup cron should delete first per `expires_at` (free 30d / pro 90d).

## First-time Bring-up on a Fresh CF Account

If you're setting up a brand new account, run these in order:

```bash
# 1. D1 database (already exists; if not: `wrangler d1 create getu-translate` and update wrangler.toml)
cd apps/api && pnpm exec wrangler d1 migrations apply DB --remote

# 2. R2 bucket
pnpm exec wrangler r2 bucket create getu-pdfs

# 3. Queue
pnpm exec wrangler queues create getu-translate-jobs

# 3b. KV namespace (M7-A2 rate limit) — both envs
pnpm exec wrangler kv namespace create RATE_LIMIT_KV
pnpm exec wrangler kv namespace create RATE_LIMIT_KV --env production
# Paste returned ids into wrangler.toml [[kv_namespaces]] / [[env.production.kv_namespaces]] blocks

# 4. Secrets (each prompts interactively)
for s in AUTH_SECRET AI_JWT_SECRET BIANXIE_API_KEY R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_PDFS_NAME RESEND_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_PRO_MONTHLY STRIPE_PRICE_PRO_YEARLY STRIPE_PRICE_CNY_MONTHLY STRIPE_PRICE_CNY_YEARLY GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET POSTHOG_PROJECT_KEY; do
  pnpm exec wrangler secret put "$s"
done

# 5. R2 lifecycle rules — manual via dashboard (no CLI / API as of 2026-04)

# 6. Deploy
pnpm deploy
```

## M7-A3 — Auto-rollback Verification & Manual Procedures

### Worker (api) — Auto-rollback

`deploy-api.yml` rolls the Worker back to the previous version automatically when `pnpm smoke:prod` exits non-zero after deploy. The workflow uses a `concurrency` group so capture-previous-version + deploy is atomic per branch.

To verify the rollback path works:

1. Go to **GitHub → Actions → Deploy API → Run workflow**.
2. Set `force_smoke_fail = true`. Trigger.
3. Workflow should:
   - Capture the previous version id (current production)
   - Deploy the new version
   - Smoke test exits 1 with `SMOKE_FORCE_FAIL=true`
   - `wrangler rollback --version-id <previous>` runs (id: `rollback`)
   - Job fails with the right error message based on rollback outcome (success / skipped / failed)
4. Verify production is back on the previous version:

```bash
cd apps/api
pnpm exec wrangler versions list --env production --json | head -50
# The latest entry should have `metadata.message` containing "auto-rollback"
# pointing to the version that's now live.
curl -sf https://api.getutranslate.com/health | jq .
```

### Worker (api) — Manual rollback

If auto-rollback fails (e.g. token permissions issue, version retention) or you need to roll back past a successful deploy:

```bash
cd apps/api
pnpm exec wrangler versions list --env production --json | head -50
# Find the version id you want to roll back to.
pnpm exec wrangler rollback --env production --version-id <id> --message "manual rollback: <reason>"
# Verify
curl -sf https://api.getutranslate.com/health | jq .
```

If the auto-rollback step itself failed in CI (rollback step `outcome == failure`), production is on the **bad** version — drop everything and run the manual rollback above.

### Web (Pages) — Manual rollback

Cloudflare Pages does NOT have CLI auto-rollback. If `deploy-web.yml` smoke test fails the workflow exits red with an actionable error message, but production is still on the broken deployment. Manual recovery:

1. Open https://dash.cloudflare.com/?to=/:account/pages/view/getu-web/
2. Click the **Deployments** tab.
3. Find the most recent successful deployment (NOT the failed one).
4. Click ⋯ → **Rollback to this deployment**.
5. Confirm.
6. Verify:

```bash
curl -sf https://getutranslate.com/ | head -5
```

Pages auto-rollback CLI support is tracked as a M7+ follow-up.
