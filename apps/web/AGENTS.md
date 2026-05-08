<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-08 -->

# web

## Purpose

`@getu/web` — The GetU Translate marketing / account / pricing / `/translate` / `/document` website. Next.js 15 App Router, React 19, **statically exported** and deployed to Cloudflare Pages at `getutranslate.com`. All authenticated interactions (login, sessions, checkout, entitlement, translate jobs, PDF document jobs) happen client-side against the `@getu/api` Worker at `api.getutranslate.com`.

Route responsibilities:
- **Landing + pricing** — marketing surface with locale-based pricing (USD vs CNY) and Paddle/Stripe upgrade flows.
- **Auth** — `/log-in` with email+password, email OTP, passkey, Google/GitHub OAuth.
- **Translate** — `/[locale]/translate` 11-model card grid + history drawer + UpgradeModal (M6.4–M6.7).
- **Document** — `/[locale]/document` PDF upload + history drawer + `/document/preview` bilingual reader (M6.8–M6.11).
- **Guides** — MDX-driven `/[locale]/guide/{step-1,translate,document}` walkthroughs.
- **Account** — `/[locale]/settings`, `/[locale]/upgrade/success`.
- **Legal** — `/privacy`, `/terms-and-conditions`, `/refund`.
- **Back-compat** — top-level `/log-in` and `/guide/step-1` redirectors so older extension builds (without locale prefix) don't 404.

Everything under `/[locale]/` is internationalized across `en`, `zh-CN`, `zh-TW`.

## Key Files

| File                  | Description                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`        | `@getu/web` manifest. Scripts: `dev`, `build`, `build:prod` (bakes `NEXT_PUBLIC_API_BASE_URL`), `pages:deploy`, `test` (vitest), `e2e` (playwright).                                       |
| `next.config.*`       | Next.js config (static export target, MDX support).                                                                                                                                       |
| `tsconfig.json`       | TS config for App Router + React 19.                                                                                                                                                      |
| `vitest.config.ts`    | Vitest config — **excludes `e2e/**`** so playwright specs don't get picked up by unit-test runs (M7-C2 fix).                                                                              |
| `playwright.config.ts`| Playwright config: testDir `./e2e`, chromium project, dev server boot via `next dev --port 3000` with `NEXT_PUBLIC_E2E=1` (mounts the e2e fixture pages) and `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8788`. CI retries=2 workers=1. |
| `mdx-components.tsx`  | App Router MDX component overrides used by the guide pages.                                                                                                                                |
| `mdx.d.ts`            | Type shim for `*.mdx` imports.                                                                                                                                                            |
| `app/layout.tsx`      | Root `<html>` / `<body>` wrapper.                                                                                                                                                          |
| `app/page.tsx`        | Root `/` — redirects to default locale.                                                                                                                                                   |
| `app/components.tsx`  | Shared components used across root + locale routes.                                                                                                                                       |
| `app/globals.css`     | Global stylesheet.                                                                                                                                                                         |

## Subdirectories

| Directory           | Purpose                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/[locale]/`     | Locale-prefixed routes (`en` / `zh-CN` / `zh-TW`): landing, pricing, auth, account, guide (MDX), legal, upgrade flow, `/translate` model grid, `/document` upload + preview reader.                               |
| `app/log-in/`       | Top-level `/log-in` redirector — preserves older extension login URLs (keeps `?redirect=`).                                                                                                                       |
| `app/guide/step-1/` | Top-level `/guide/step-1` redirector for older extension links.                                                                                                                                                    |
| `components/`       | App-wide React components: `AuthGate.tsx` (client gate around authed surfaces — requires explicit locale-aware `fallback` prop, throws if missing; loading uses `aria-hidden` shell, not full-page spinner).      |
| `lib/`              | App-level helpers: oRPC client, better-auth client, analytics shim, i18n (see `lib/AGENTS.md`).                                                                                                                    |
| `lib/i18n/`         | Locale list, message catalogues, routing helpers (`localeHref`, `switchLocalePath`, `languageAlternates`).                                                                                                        |
| `e2e/`              | Playwright specs (`upgrade-modal.spec.ts`) plus a `fixtures/app/e2e/...` route tree that Next.js only renders when `NEXT_PUBLIC_E2E=1`. Includes a `run-playwright.mjs` wrapper used in CI. M7-C2.                |

## For AI Agents

### Working In This Directory

- **Static export only.** No server components that need a runtime (no DB, no secrets). All dynamic behaviour is client-side against the api Worker.
- **`NEXT_PUBLIC_API_BASE_URL` is baked at build time.** Changing it requires a rebuild; `pages:deploy` script hard-codes the prod URL.
- **Client-side auth.** Use `lib/auth-client.ts` (better-auth client) for login/session; never import server auth code.
- **`AuthGate` requires an explicit `fallback`** — pass a locale-aware "please log in" surface from the calling page; the component throws on missing prop (M7-C1 hardening).
- **Locale-prefixed URLs.** Internal links must go through `localeHref(locale, path)` — do not hand-build `/en/price/`.
- **Legacy redirectors** (top-level `/log-in`, `/guide/step-1`) are deliberately not locale-prefixed and must keep their query-string pass-through (`?redirect=`).
- The `pages:deploy` script is named that (not `deploy`) so pnpm's builtin `pnpm deploy` doesn't shadow it.
- **Vitest + Playwright are separate runners.** Keep e2e specs under `e2e/` (excluded by `vitest.config.ts`) and unit tests in `__tests__/` neighbours. Never import `@playwright/test` in a vitest spec.

### Testing Requirements

- `pnpm --filter @getu/web test` runs vitest (i18n routing, AuthGate behavior, analytics suppression, `translate-orchestrator`, document preview state).
- `pnpm --filter @getu/web e2e` runs Playwright against a dev server that boots with `NEXT_PUBLIC_E2E=1` so the `e2e/fixtures/app/e2e/...` routes mount. Today the e2e suite covers all five UpgradeModal variants (`free_quota_exceeded`, `pro_model_clicked`, `pdf_quota_exceeded`, `char_limit_exceeded`, `history_cleanup_warning`).
- For new authed surfaces, add a vitest test that asserts the `AuthGate` fallback path AND, when applicable, an e2e fixture that opens the actual modal/dialog.

### Deployment

- `pnpm --filter @getu/web pages:deploy` → `next build` (prod API URL) → `wrangler pages deploy out --project-name=getu-web --branch=main`.
- CI (`.github/workflows/deploy-web.yml`) does the same on `main` pushes that touch `apps/web/**`, `packages/contract/**`, or `packages/definitions/**`. Pages has no CLI auto-rollback — see workflow comments for manual recovery.
- Cloudflare custom domain (`getutranslate.com`) is configured in the Pages project UI only.

## Dependencies

### Internal

- `@getu/contract` — oRPC contract consumed by `lib/orpc-client.ts` and `lib/analytics.ts`.
- `@getu/definitions` — locale list, model registry for the `/translate` page.

### External

- `next@^15`, `react@^19` — framework.
- `better-auth` + `@better-auth/passkey` — client SDK.
- `@orpc/client` — typed RPC client.
- `@playwright/test` — e2e runner.
- `wrangler` — Pages deploy.
- `vitest` — unit tests.

<!-- MANUAL: -->
