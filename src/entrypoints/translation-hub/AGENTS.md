<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# translation-hub

## Purpose

Standalone HTML page bundled by WXT as `/translation-hub.html` and opened in its own browser tab (the `<meta name="manifest.open_in_tab" content="true">` hint). It provides a multi-provider translation workbench: pick source/target languages (or auto-detect), type/paste source text, choose a custom prompt for LLM providers, select one or more enabled translate providers, and render one `TranslationCard` per provider that streams its result via `executeTranslate`. Local UI state (input text, language overrides, selected providers, expanded cards, the current translate request) lives in module-scoped Jotai atoms in `atoms.ts`; durable state (config, providers, theme) is hydrated from WXT `local:` storage at boot in `main.tsx`.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` | HTML shell with `<div id="root">` and `manifest.open_in_tab` hint so WXT marks the page as opening in a tab rather than a popup.                                                                                                                                                                                                                                                                                                                               |
| `main.tsx`   | Boots the React tree: reads `getLocalConfig()` + `getLocalThemeMode()`, applies theme, hydrates `configAtom`/`baseThemeModeAtom` via `useHydrateAtoms`, and mounts `<App/>` inside `QueryClientProvider`/`JotaiProvider`/`ThemeProvider`/`TooltipProvider` using `renderPersistentReactRoot`. Adds global chrome (`FrogToast`, `HelpButton`).                                                                                                                  |
| `app.tsx`    | Page layout — header + responsive 2-column grid combining `LanguageControlPanel`, `PromptSelector`, `TranslationServiceDropdown`, `TranslationPanelActions`, `TextInput`, and `TranslationPanel`.                                                                                                                                                                                                                                                              |
| `atoms.ts`   | Hub-local Jotai atoms: `sourceLangCodeAtom`/`targetLangCodeAtom` with override-vs-config fallback, `inputTextAtom`, `detectedSourceLangCodeAtom`, `selectedProviderIdsAtom` (defaults to all enabled translate providers), `selectedProvidersAtom` (derived configs), `translationCardExpandedStateAtom`, write-only `exchangeLangCodesAtom`, and `translateRequestAtom` (command-pattern snapshot with `timestamp` so cards re-fire on each translate click). |

## Subdirectories

| Directory     | Purpose                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `components/` | React components for the hub UI (language picker, text input, provider dropdown, translation cards, etc.) (see `components/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- This is a normal extension page, not a content script — `browser.*`, WXT `storage`, and `i18n` work, but you cannot use `defineContentScript` or `chrome.scripting`.
- Never read the persisted `Config` directly here — go through `configAtom`/`configFieldsAtomMap` from `@/utils/atoms/config`. Local-only UI overrides (e.g. lang override) live in this folder's `atoms.ts` and intentionally do not write back to storage.
- `translateRequestAtom` is a _command_: `TextInput` writes a snapshot `{inputText, sourceLanguage, targetLanguage, timestamp: Date.now()}`, and each `TranslationCard` watches `request?.timestamp` to re-trigger via React Query — bumping the timestamp is what re-fires translation, even with identical text.
- Provider selection stores only `id`s (`selectedProviderIdsAtom`); the derived `selectedProvidersAtom` joins against `configFieldsAtomMap.providersConfig`. Removing a provider from the hub view should not delete it from config.
- The page is opened from the popup/options via `browser.runtime.getURL("/translation-hub.html")` (or the equivalent `tabs.create` flow); when you change the entry filename you must update those callers too.
- Keep the boot order in `main.tsx` intact: `applyTheme(...)` before mounting React, and `useHydrateAtoms` _inside_ `JotaiProvider` (otherwise the first render sees defaults instead of persisted config).

### Testing Requirements

Run `pnpm test` (Vitest). No co-located `__tests__/`. The hub exercises shared modules (translation queues, provider config) that have their own specs under `@/utils/**/__tests__/`; live-network tests there respect `SKIP_FREE_API=true`.

### Common Patterns

- Override-or-default Jotai atoms: a private `*OverrideAtom` plus a public read/write atom that returns the override when set, otherwise reads from `configFieldsAtomMap.*`.
- Command-pattern atom + `timestamp` to re-fire effects on identical inputs.
- React tree wrapping: `QueryClientProvider` (shared `queryClient`) → `JotaiProvider` → `HydrateAtoms` → `ThemeProvider` → `TooltipProvider`.
- Page chrome (`FrogToast`, `HelpButton`) reused from shared components rather than re-implemented per page.

## Dependencies

### Internal

- `@/utils/atoms/config`, `@/utils/atoms/theme` — shared persisted atoms.
- `@/utils/config/storage` — `getLocalConfig()`.
- `@/utils/config/helpers` — `getTranslateProvidersConfig`, `filterEnabledProvidersConfig`.
- `@/utils/constants/config` — `DEFAULT_CONFIG`.
- `@/utils/react-root` — `renderPersistentReactRoot`.
- `@/utils/tanstack-query` — shared `queryClient`.
- `@/utils/theme` — theme application helpers.
- `@/components/{frog-toast,help-button,providers/theme-provider,ui/base-ui/tooltip}` — shared UI.

### External

- `react` 19, `jotai`, `jotai/utils` (`useHydrateAtoms`).
- `@tanstack/react-query` — provider for cards' `useMutation`.
- `#imports` — `i18n` for translated strings.

<!-- MANUAL: -->
