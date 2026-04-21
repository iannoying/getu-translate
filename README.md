# GetU Translate · 懂你翻译

Cross-platform translation & language-learning toolkit. Monorepo for the browser extension, web site, and backend API.

## Layout

- `apps/extension/` — browser extension (Chrome / Edge / Firefox MV3), WXT + React
- `apps/web/` — Next.js 15 site: login, pricing, account (Vercel) · _Phase 1 Task 7_
- `apps/api/` — Hono on Cloudflare Workers: auth, oRPC, Stripe/Paddle webhooks · _Phase 1 Task 8_
- `packages/definitions/` — shared domain constants (language codes, URL bases)
- `packages/contract/` — oRPC procedure contracts shared extension ↔ api
- `packages/db/` — Drizzle schema + migrations · _Phase 1 Task 9_

## Quickstart

```bash
corepack enable
pnpm install
pnpm --filter @getu/extension dev   # opens Chrome with the extension loaded
pnpm --filter @getu/web dev         # Next.js on :3000
pnpm --filter @getu/api dev         # Wrangler on :8788
```

## License

GPL-3.0. Forked from [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog).
