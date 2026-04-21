<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# components

## Purpose

Compact React widgets that compose the popup body and footer. Each is a single-row control bound to either persisted config (via `configFieldsAtomMap.<field>`) or popup-local atoms in `../atoms/`. Together they expose the per-tab translation workflow: language pair, translation mode, provider, prompt, the main translate-page button, whitelist/blacklist toggle, "always translate this site" switch, hotkey selector, AI-smart-context switch, plus header chrome (translation hub, Discord, blog notification) and footer chrome (more menu, floating-button toggle).

## Key Files

| File                                   | Description                                                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language-options-selector.tsx`        | Source/target `Select` rows reading `configFieldsAtomMap.language` and `detectedCodeAtom`; uses `LANG_CODE_TO_*` from `@read-frog/definitions`.                                                           |
| `translation-mode-selector.tsx`        | `Select` over `TRANSLATION_MODES`; auto-switches provider away from `google-translate` when entering `translationOnly` mode.                                                                              |
| `translate-provider-field.tsx`         | `ProviderSelector` filtered by `isTranslateProvider`; excludes `google-translate` when mode is `translationOnly`.                                                                                         |
| `translate-prompt-selector.tsx`        | Custom-prompt `Select` gated on `isLLMProvider(provider)`; reads `translate.customPromptsConfig`.                                                                                                         |
| `translate-button.tsx`                 | Primary action — sends `tryToSetEnablePageTranslationByTabId` with an analytics context (`POPUP` surface), disabled when tab is ignored or blocked by site-control mode; shows formatted shortcut suffix. |
| `site-control-toggle.tsx`              | Single switch that picks whitelist or blacklist atom based on `siteControl.mode`.                                                                                                                         |
| `always-translate.tsx`                 | Switch toggling current hostname in `translate.page.autoTranslatePatterns`; wrapped in React 19 `<Activity>` so it stays mounted but hidden when site is blocked.                                         |
| `node-translation-hotkey-selector.tsx` | `Select` over `HOTKEYS` constants with `HOTKEY_ICONS` rendering; binds `translate.node.hotkey`.                                                                                                           |
| `ai-smart-context.tsx`                 | Switch for `translate.enableAIContentAware`, persisted via `deepmerge`.                                                                                                                                   |
| `translation-hub-button.tsx`           | Header icon button — `browser.tabs.create` with `runtime.getURL("/translation-hub.html")`.                                                                                                                |
| `discord-button.tsx`                   | Header icon opening `https://discord.gg/ej45e3PezJ`.                                                                                                                                                      |
| `blog-notification.tsx`                | Bell button driven by TanStack Query — fetches `${WEBSITE_URL}/api/blog/latest`, compares against `getLastViewedBlogDate`, shows indicator via `hasNewBlogPost`.                                          |
| `floating-button.tsx`                  | Switch for `floatingButton.enabled` (used in non-popup contexts; lives here for shared atom binding).                                                                                                     |
| `more-menu.tsx`                        | Footer dropdown — Discord, WeChat group image, store-review URL via `getReviewUrl`.                                                                                                                       |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Components must stay row-shaped (`flex items-center justify-between gap-2`) and use `text-[13px] font-medium` labels to match existing density at 320px width.
- Reads from popup atoms (`../atoms/*`) compose with `configFieldsAtomMap` reads in the same component — that is the standard shape, not an antipattern.
- `TranslateButton` must use `createFeatureUsageContext(ANALYTICS_FEATURE.PAGE_TRANSLATION, ANALYTICS_SURFACE.POPUP)` when enabling, and omit the context when disabling.
- Provider/prompt selectors return `null` when their gating predicates fail — keep that behavior so the popup collapses cleanly.
- Use `<Activity mode="visible|hidden">` (React 19) instead of conditional unmount when the control should preserve internal state across visibility flips.
- Persisted writes that touch nested config keys use `deepmerge` (e.g. in `ai-smart-context.tsx`) — do not pass partial flat objects unless the field is top-level.

### Testing Requirements

`pnpm test` (Vitest + jsdom + Testing Library). Co-located `__tests__/blog-notification.test.tsx` exists. The blog fetch uses real network in production; tests must mock `getLatestBlogDate`. `SKIP_FREE_API` does not gate these tests.

### Common Patterns

- TanStack Query keys: `["last-viewed-blog-date"]`, `["latest-blog-post", blogLocale]` — keep in sync with `app-sidebar/whats-new-footer.tsx` since both invalidate the same `last-viewed-blog-date` cache.
- Background-bound actions go through `sendMessage(...)` from `@/utils/message` — never call `browser.runtime.sendMessage` directly.

## Dependencies

### Internal

- `../atoms/auto-translate`, `../atoms/ignore`, `../atoms/site-control`
- `@/utils/atoms/config`, `@/utils/atoms/provider`, `@/utils/atoms/detected-code`
- `@/utils/message`, `@/utils/analytics`, `@/utils/blog`, `@/utils/utils`, `@/utils/os`, `@/utils/styles/utils`
- `@/utils/constants/hotkeys`, `@/utils/constants/prompt`, `@/utils/constants/url`
- `@/utils/config/helpers` (`filterEnabledProvidersConfig`, `getProviderConfigById`, `getLLMProvidersConfig`)
- `@/utils/page-translation-shortcut`
- `@/types/analytics`, `@/types/config/provider`, `@/types/config/translate`
- `@/components/ui/base-ui/*`, `@/components/help-tooltip`, `@/components/llm-providers/provider-selector`

### External

- `jotai`, `@tanstack/react-query`, `@iconify/react`, `deepmerge-ts`, `@read-frog/definitions`
- `#imports` (WXT — `browser`, `i18n`)

<!-- MANUAL: -->
