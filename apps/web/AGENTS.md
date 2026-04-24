<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# web

## Purpose

`@getu/web` — The GetU Translate marketing / account / pricing website. Next.js 15 App Router, React 19, **statically exported** and deployed to Cloudflare Pages at `getutranslate.com`. All authenticated interactions (login, sessions, checkout, entitlement) happen client-side against the `@getu/api` Worker at `api.getutranslate.com`.

Route responsibilities:
- **Landing + pricing** — marketing surface with locale-based pricing (USD vs CNY) and Paddle/Stripe upgrade flows.
- **Auth** — `/log-in` with email+password, email OTP, passkey, Google/GitHub OAuth.
- **Account** — `/settings`, `/upgrade/success` (post-checkout).
- **Onboarding** — `/guide/step-1` walkthrough linked from the extension.
- **Legal** — `/privacy`, `/terms-and-conditions`, `/refund`.
- **Back-compat** — top-level `/log-in` and `/guide/step-1` redirectors so older extension builds (without locale prefix) don't 404.

Everything under `/[locale]/` is internationalized across `en`, `zh-CN`, `zh-TW`.

## Key Files

| File                 | Description                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `package.json`       | `@getu/web` manifest. Scripts: `dev`, `build`, `build:prod` (bakes `NEXT_PUBLIC_API_BASE_URL`), `pages:deploy`.       |
| `next.config.*`      | Next.js config (static export target).                                                                              |
| `tsconfig.json`      | TS config for App Router + React 19.                                                                                |
| `app/layout.tsx`     | Root `<html>` / `<body>` wrapper.                                                                                    |
| `app/page.tsx`       | Root `/` — redirects to default locale.                                                                              |
| `app/components.tsx` | Shared components used across root + locale routes.                                                                  |
| `app/globals.css`    | Global stylesheet.                                                                                                   |

## Subdirectories

| Directory             | Purpose                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `app/[locale]/`       | Locale-prefixed routes (`en` / `zh-CN` / `zh-TW`): landing, pricing, auth, account, guide, legal, upgrade flow.       |
| `app/log-in/`         | Top-level `/log-in` redirector — preserves older extension login URLs (keeps `?redirect=`).                           |
| `app/guide/step-1/`   | Top-level `/guide/step-1` redirector for older extension links.                                                       |
| `lib/`                | App-level helpers: oRPC client, better-auth client, i18n (see `lib/`).                                                |
| `lib/i18n/`           | Locale list, message catalogues, routing helpers (`localeHref`, `switchLocalePath`, `languageAlternates`).            |

## For AI Agents

### Working In This Directory

- **Static export only.** No server components that need a runtime (no DB, no secrets). All dynamic behaviour is client-side against the api Worker.
- **`NEXT_PUBLIC_API_BASE_URL` is baked at build time.** Changing it requires a rebuild; `pages:deploy` script hard-codes the prod URL.
- **Client-side auth.** Use `lib/auth-client.ts` (better-auth client) for login/session; never import server auth code.
- **Locale-prefixed URLs.** Internal links must go through `localeHref(locale, path)` — do not hand-build `/en/price/`.
- **Legacy redirectors** (top-level `/log-in`, `/guide/step-1`) are deliberately not locale-prefixed and must keep their query-string pass-through (`?redirect=`).
- The `pages:deploy` script is named that (not `deploy`) so pnpm's builtin `pnpm deploy` doesn't shadow it.

### Testing Requirements

- `pnpm --filter @getu/web test` runs vitest. i18n routing helpers in `lib/i18n/__tests__/` are the primary coverage target today.
- No E2E in-repo; verify visually after `pnpm --filter @getu/web dev` at `http://localhost:3000`.

### Deployment

- `pnpm --filter @getu/web pages:deploy` → `next build` (prod API URL) → `wrangler pages deploy out --project-name=getu-web --branch=main`.
- Cloudflare custom domain (`getutranslate.com`) is configured in the Pages project UI only.

## Dependencies

### Internal

- `@getu/contract` — oRPC contract consumed by `lib/orpc-client.ts`.

### External

- `next@^15`, `react@^19` — framework.
- `better-auth` + `@better-auth/passkey` — client SDK.
- `@orpc/client` — typed RPC client.
- `wrangler` — Pages deploy.
- `vitest` — tests.

<!-- MANUAL: -->
