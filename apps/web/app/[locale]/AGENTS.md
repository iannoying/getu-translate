<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-08 -->

# [locale]

## Purpose

Localized route tree. `[locale]` is one of `en`, `zh-CN`, `zh-TW` (validated via `lib/i18n/locales.ts`). Static params are pre-generated at build time so every locale-prefixed URL is statically exported. Houses both marketing surfaces and the M6 product pages (`/translate`, `/document`).

## Key Files

| File         | Description                                                                    |
| ------------ | ------------------------------------------------------------------------------ |
| `layout.tsx` | Locale-aware layout: sets `<html lang>`, loads message catalogue, renders nav. |
| `page.tsx`   | Locale-specific landing page (`/en/`, `/zh-CN/`, `/zh-TW/`).                   |

## Subdirectories

| Directory               | Purpose                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `log-in/`               | `/{locale}/log-in` — email+password, email OTP, passkey, Google/GitHub OAuth. Honors `?redirect=`.                                                                                                                                                                                                                              |
| `price/`                | `/{locale}/price` — pricing with locale-based currency (USD for `en`, CNY for `zh-*`). Upgrade CTA.                                                                                                                                                                                                                              |
| `settings/`             | `/{locale}/settings` — signed-in user profile / account surface.                                                                                                                                                                                                                                                                |
| `translate/`            | `/{locale}/translate` — M6.4–M6.7 11-model card grid. Components: `TranslateShell`, `ModelGrid`, `ModelCard`, `LangPicker`, `HistoryDrawer`, `QuotaBadge`, `UpgradeModal`. Orchestration in `translate-orchestrator.ts` (vitest-covered). `demo-data.ts` powers prototype-style preview when no auth. AuthGate wraps the surface. |
| `document/`             | `/{locale}/document` — M6.8–M6.11 PDF upload + history. `document-client.tsx` drives R2 presign upload + oRPC job creation; `components/PdfHistoryDrawer.tsx` lists prior jobs. `preview/` renders the bilingual reader once a job completes (`preview-client-wrapper.tsx`, `preview-client.tsx`, `preview-state.ts` with vitest). |
| `guide/step-1/`         | `/{locale}/guide/step-1` — onboarding walkthrough linked from the extension after install.                                                                                                                                                                                                                                       |
| `guide/translate/`      | `/{locale}/guide/translate` — MDX-driven `/translate` how-to (per-locale `_content/{en,zh-CN,zh-TW}.mdx`).                                                                                                                                                                                                                       |
| `guide/document/`       | `/{locale}/guide/document` — MDX-driven `/document` how-to (per-locale `_content/{en,zh-CN,zh-TW}.mdx`).                                                                                                                                                                                                                         |
| `upgrade/success/`      | `/{locale}/upgrade/success` — post-checkout confirmation page.                                                                                                                                                                                                                                                                  |
| `privacy/`              | `/{locale}/privacy` — privacy policy.                                                                                                                                                                                                                                                                                            |
| `terms-and-conditions/` | `/{locale}/terms-and-conditions` — ToS.                                                                                                                                                                                                                                                                                          |
| `refund/`               | `/{locale}/refund` — refund policy.                                                                                                                                                                                                                                                                                              |

## For AI Agents

### Working In This Directory

- **Always use `localeHref(locale, path)`** from `lib/i18n/routing.ts` to build internal links — never hand-build `/en/...`.
- **`page.tsx` files should be thin server components** that gather static data and render a client component for interactivity. See `price/PricePageClient.tsx` and `translate/page.tsx` → `translate-client.tsx` for the pattern.
- **Pricing currency**: gate on the locale, not on a runtime flag — the decision is baked at build time.
- **Authed product surfaces** (`/translate`, `/document`, `/document/preview`) MUST wrap their client tree in `<AuthGate fallback={…}>` with a locale-aware fallback (M7-C1). The component throws if `fallback` is missing.
- **MDX guide pages**: keep one `_content/{locale}.mdx` per locale; the `page.tsx` selects via the `[locale]` param. Use the shared `mdx-components.tsx` overrides for headings/links so they pick up the site theme.
- Auth flows use `lib/auth-client.ts`. Never import server-side better-auth code here.
- Keep copy in the message catalogue (`lib/i18n/messages.ts`); do not inline literal strings that need translation. MDX bodies are the exception — translation is per-locale file.

### Testing Requirements

- Unit tests live under `__tests__/` next to the source (`translate/__tests__/translate-orchestrator.test.ts`, `document/preview/__tests__/preview-state.test.ts`).
- E2E tests live in `apps/web/e2e/` and currently cover all `UpgradeModal` variants — extend that suite when you add a new modal source key.
- i18n routing is covered under `lib/i18n/__tests__/`. Verify new pages visually via `pnpm --filter @getu/web dev`.

<!-- MANUAL: -->
