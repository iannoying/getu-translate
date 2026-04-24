<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# [locale]

## Purpose

Localized route tree. `[locale]` is one of `en`, `zh-CN`, `zh-TW` (validated via `lib/i18n/locales.ts`). Static params are pre-generated at build time so every locale-prefixed URL is statically exported.

## Key Files

| File          | Description                                                                       |
| ------------- | --------------------------------------------------------------------------------- |
| `layout.tsx`  | Locale-aware layout: sets `<html lang>`, loads message catalogue, renders nav.    |
| `page.tsx`    | Locale-specific landing page (`/en/`, `/zh-CN/`, `/zh-TW/`).                      |

## Subdirectories

| Directory               | Purpose                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `log-in/`               | `/{locale}/log-in` — email+password, email OTP, passkey, Google/GitHub OAuth. Honors `?redirect=`.      |
| `price/`                | `/{locale}/price` — pricing with locale-based currency (USD for `en`, CNY for `zh-*`). Upgrade CTA.      |
| `settings/`             | `/{locale}/settings` — signed-in user profile / account surface.                                        |
| `guide/step-1/`         | `/{locale}/guide/step-1` — onboarding walkthrough linked from the extension after install.              |
| `upgrade/success/`      | `/{locale}/upgrade/success` — post-checkout confirmation page.                                          |
| `privacy/`              | `/{locale}/privacy` — privacy policy.                                                                   |
| `terms-and-conditions/` | `/{locale}/terms-and-conditions` — ToS.                                                                 |
| `refund/`               | `/{locale}/refund` — refund policy.                                                                     |

## For AI Agents

### Working In This Directory

- **Always use `localeHref(locale, path)`** from `lib/i18n/routing.ts` to build internal links — never hand-build `/en/...`.
- **`page.tsx` files should be thin server components** that gather static data and render a client component for interactivity. See `price/PricePageClient.tsx` for the pattern.
- **Pricing currency**: gate on the locale, not on a runtime flag — the decision is baked at build time.
- Auth flows use `lib/auth-client.ts`. Never import server-side better-auth code here.
- Keep copy in the message catalogue (`lib/i18n/messages.ts`); do not inline literal strings that need translation.

### Testing Requirements

- No page-level tests today; i18n routing is covered under `lib/i18n/__tests__/`. Verify new pages visually via `pnpm --filter @getu/web dev`.

<!-- MANUAL: -->
