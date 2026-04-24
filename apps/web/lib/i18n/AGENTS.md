<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# i18n

## Purpose

Locale list, message catalogue, and URL routing helpers for the web app's three supported languages: `en`, `zh-CN`, `zh-TW`. Covers link construction, locale switching, and SEO language alternates.

## Key Files

| File            | Description                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `locales.ts`    | `SUPPORTED_LOCALES` tuple + `Locale` type + default-locale helpers.                                                                |
| `messages.ts`   | Message catalogue (per-locale string tables) consumed by client components.                                                        |
| `routing.ts`    | `localeHref`, `switchLocalePath`, `absoluteLocaleUrl`, `languageAlternates`. `SITE_ORIGIN` is the canonical prod origin.           |
| `__tests__/`    | Vitest coverage for routing helpers — the most-tested file in the web package.                                                    |

## For AI Agents

- **`SITE_ORIGIN` is canonical.** Use it for SEO `alternates.languages` entries and any absolute URL baked into the static export.
- **`switchLocalePath`** falls back to the locale root when the current path isn't in `KNOWN_PAGE_PATHS` — keep that list in sync when adding top-level pages.
- Every page translation must be a real entry in `messages.ts`; never hard-code English strings in a component.
- When adding a new locale, update `SUPPORTED_LOCALES`, `messages.ts`, `languageAlternates`, and generate-static-params on every `[locale]` page.

<!-- MANUAL: -->
