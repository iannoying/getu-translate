# GetU Translate — Infrastructure checklist

## Cloudflare

- Domain: `getutranslate.com` (registered via Cloudflare Registrar — confirmed 2026-04-20)
- Workers subdomain: `*.iannoying.workers.dev` (to be routed via `api.getutranslate.com` in Phase 2)
- DNS: set up in Phase 2 (A / CNAME for `api.getutranslate.com`, `www`, `@`)

## Vercel

- Project: `getu-web` (links `apps/web`)
- Root directory: `apps/web`
- Build command: `pnpm --filter @getu/web build`
- Install command: `pnpm install`
- Production domain: `getutranslate.com` (moved from CF → Vercel or kept on CF with proxy)
- Decision pending: where `www` root sits — Vercel or CF Pages.

## Neon Postgres

- Project: `getu-translate`
- Default branch: `main`
- Connection string stored in Vercel env + CF Workers secrets as `DATABASE_URL`.

## PostHog

- Reuse existing project if available, else new `getu-translate` project.
