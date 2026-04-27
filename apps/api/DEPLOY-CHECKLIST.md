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
| `POSTHOG_PROJECT_KEY` | (M6.13 Track A — to be added) Server-side analytics |

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

# 4. Secrets (each prompts interactively)
for s in AUTH_SECRET AI_JWT_SECRET BIANXIE_API_KEY R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_PDFS_NAME RESEND_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_PRO_MONTHLY STRIPE_PRICE_PRO_YEARLY STRIPE_PRICE_CNY_MONTHLY STRIPE_PRICE_CNY_YEARLY GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET POSTHOG_PROJECT_KEY; do
  pnpm exec wrangler secret put "$s"
done

# 5. R2 lifecycle rules — manual via dashboard (no CLI / API as of 2026-04)

# 6. Deploy
pnpm deploy
```
