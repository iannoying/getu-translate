<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# popup

## Purpose

The toolbar popup window (320px wide, mounted on `<body id="root">`). It surfaces quick toggles and selectors for the user's active tab — language pair, translation mode, provider/prompt, the main "Translate page" button, site-control whitelist/blacklist switches, "always translate this site", node-translation hotkey, and AI smart-context. The footer hosts an "Open options page" button and a "more" dropdown. The popup hydrates Jotai with both the persisted `Config` and tab-derived state (active URL, in-patterns flag, page-translated flag, ignore-tab flag) computed at boot.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx`   | Async boot — fetches `getLocalConfig`, `getLocalThemeMode`, queries the active tab, calls `getEnablePageTranslationByTabId` via `sendMessage`, then mounts via `renderPersistentReactRoot` inside `JotaiProvider` + `QueryClientProvider` + `HashRouter`-free `ThemeProvider`/`TooltipProvider` chain, hydrating seven atoms.             |
| `app.tsx`    | Layout shell — vertical stack of header (account / hub / discord / blog), `LanguageOptionsSelector`, `TranslationModeSelector`, `TranslateProviderField`, `TranslatePromptSelector`, `TranslateButton`, `SiteControlToggle`, `AlwaysTranslate`, `Hotkey`, `AISmartContext`; bottom bar opens options page and shows version + `MoreMenu`. |
| `index.html` | WXT entrypoint HTML loading `main.tsx` into `#root`.                                                                                                                                                                                                                                                                                      |

## Subdirectories

| Directory     | Purpose                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| `atoms/`      | Popup-local Jotai atoms for tab state and site-pattern toggling (see `atoms/AGENTS.md`). |
| `components/` | Compact UI widgets unique to the popup (see `components/AGENTS.md`).                     |

## For AI Agents

### Working In This Directory

- The popup is sized at `w-[320px]` on the root element — never write components that assume a wider viewport. Use `text-[13px]` for control labels to match existing density.
- Tab-derived state (`isPageTranslated`, `isInPatterns`, `isIgnoreTab`, whitelist/blacklist membership) is computed once in `main.tsx` and hydrated; do not refetch from `browser.tabs` inside React render — read the atoms instead.
- The popup uses `renderPersistentReactRoot` (not `createRoot` directly) so HMR preserves the root across edits.
- `HashRouter` is intentionally absent — the popup has no routing. To open settings use `browser.runtime.openOptionsPage()`.
- `getEnablePageTranslationByTabId` is sent via `@webext-core/messaging` to the background; that handler reads from the per-tab translation state.
- `Activity` from React 19 is used (e.g. in `always-translate.tsx`) to mount-but-hide rather than unmount, preserving switch state across visibility changes.

### Testing Requirements

`pnpm test` (Vitest + jsdom). Component tests live in `components/__tests__/` (e.g. `blog-notification.test.tsx`). No live network is reached at popup boot, so `SKIP_FREE_API` is not relevant here.

### Common Patterns

- Each row is `<div className="flex items-center justify-between gap-2">` with a `<span className="text-[13px] font-medium">` label and a `Switch`/`Select`/`Button` on the right.
- Atoms come from `@/utils/atoms/config` (`configFieldsAtomMap.<field>`) for persisted config and from `./atoms/*` for tab-scoped ephemeral state.
- Provider/prompt selectors gate themselves on `isLLMProvider(provider)` or `isTranslateProvider(provider)` and return `null` when inapplicable.

## Dependencies

### Internal

- `@/utils/atoms/config`, `@/utils/atoms/theme`, `@/utils/atoms/provider`, `@/utils/atoms/detected-code`
- `@/utils/config/storage`, `@/utils/constants/config`, `@/utils/constants/hotkeys`, `@/utils/constants/prompt`
- `@/utils/message` (`sendMessage` for `getEnablePageTranslationByTabId` / `tryToSetEnablePageTranslationByTabId`)
- `@/utils/react-root`, `@/utils/tanstack-query`, `@/utils/theme`, `@/utils/url`, `@/utils/utils`, `@/utils/blog`, `@/utils/page-translation-shortcut`, `@/utils/analytics`, `@/utils/os`
- `@/components/ui/base-ui/*` (shadcn primitives), `@/components/providers/theme-provider`, `@/components/recovery/recovery-boundary`, `@/components/frog-toast`, `@/components/user-account`, `@/components/help-tooltip`, `@/components/llm-providers/provider-selector`

### External

- `react` 19 (`Activity`, `useEffectEvent`), `jotai` + `jotai/utils` (`useHydrateAtoms`), `@tanstack/react-query`, `@iconify/react`, `@tabler/icons-react`, `deepmerge-ts`, `@read-frog/definitions` (lang code maps).

<!-- MANUAL: -->
