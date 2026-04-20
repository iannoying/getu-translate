<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# components

## Purpose

React building blocks for the translation-hub page. Each component reads/writes the hub-scoped Jotai atoms in `../atoms.ts` (input text, language overrides, selected providers, expanded state, translate request) and the shared `configFieldsAtomMap` for persisted settings. Together they render the language pickers, prompt picker, provider multi-select, the textarea with the translate button, the action bar (expand/collapse all), and the per-provider result cards driven by `useMutation` calls into `executeTranslate`.

## Key Files

| File                               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language-control-panel.tsx`       | Side-by-side source/target language pickers with a swap button; debounces `detectLanguage()` (LLM-aware when `languageDetection.mode === "llm"`) on `inputTextAtom` to populate `detectedSourceLangCodeAtom`; disables swap when source is `auto`.                                                                                                                                                                                            |
| `searchable-language-selector.tsx` | Thin wrapper that combines `FieldRoot`/`FieldLabel` with the shared `LanguageCombobox`; surfaces `detectedLangCode` so the combobox can highlight the auto-detected entry.                                                                                                                                                                                                                                                                    |
| `prompt-selector.tsx`              | Lets the user choose a custom translate prompt from `translate.customPromptsConfig.patterns`; only renders when at least one selected provider is an LLM provider; writes back via `configFieldsAtomMap.translate` (a value of `DEFAULT_TRANSLATE_PROMPT_ID` clears the override to `null`).                                                                                                                                                  |
| `translation-service-dropdown.tsx` | Multi-select shadcn `Select` over enabled translate providers, grouped into AI translators, non-API translators, and pure-API translators (using `getLLMProvidersConfig`/`getNonAPIProvidersConfig`/`getPureAPIProvidersConfig`); shows count badge and a settings button that opens `options.html#/api-providers` in a new tab.                                                                                                              |
| `text-input.tsx`                   | Tall `Textarea` bound to `inputTextAtom` with a Translate button (Cmd/Ctrl+Enter shortcut) that writes a fresh `TranslateRequest` snapshot (with `Date.now()`) into `translateRequestAtom`.                                                                                                                                                                                                                                                   |
| `translation-panel.tsx`            | Renders one `TranslationCard` per id in `selectedProviderIdsAtom`; shows an `Empty` state when nothing is selected; bridges `expandedById` map ↔ per-card `isExpanded`/`onExpandedChange`.                                                                                                                                                                                                                                                    |
| `translation-panel-actions.tsx`    | Two icon buttons that bulk expand/collapse every selected provider's card by writing into `translationCardExpandedStateAtom`; auto-disables when already in the matching state.                                                                                                                                                                                                                                                               |
| `translation-card.tsx`             | Per-provider result card. Resolves provider config + provider icon, runs `executeTranslate` inside a React Query `useMutation` wrapped by `trackFeatureAttempt(TRANSLATION_HUB)`; uses a `requestIdRef` counter to ignore stale responses from slow providers; supports retry, copy-to-clipboard, expand/collapse, and remove-from-selection; refires whenever `translateRequestAtom`'s `timestamp` changes via `useEffectEvent`+`useEffect`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- All cross-component state lives in `../atoms.ts` — components must not own translate state via `useState`. New shared state belongs in that atoms file.
- `TranslationCard` keeps a `requestIdRef` counter so a slow earlier request can't overwrite a newer one (returning `undefined` silently discards the stale response). Preserve this pattern when adding new async mutations here.
- LLM-only UI (e.g. `PromptSelector`) must gate on `selectedProviders.some(p => isLLMProvider(p.provider))` — non-LLM providers (Google, DeepL, etc.) ignore custom prompts.
- Provider grouping uses `getLLMProvidersConfig`/`getNonAPIProvidersConfig`/`getPureAPIProvidersConfig` from `@/utils/config/helpers`; do not duplicate the grouping logic.
- All visible strings go through `i18n.t(...)` (keys live under `translationHub.*`/`translateService.*`/`options.translation.*` in `src/locales/`). Avoid hard-coded English text.
- React 19 features in use: `useEffectEvent` (in `translation-card.tsx`) — the rendering callback is captured fresh each render but the effect itself only fires on `request?.timestamp` change; do not refactor to a plain `useEffect(triggerTranslation, [request])` or you'll re-fire on every state change.
- Toasts use the shared `sonner` instance — `meta: { suppressToast: true }` on the mutation prevents the global query error handler from double-toasting; keep it when adding new mutations the card surface already handles.

### Testing Requirements

Run `pnpm test` (Vitest). No co-located `__tests__/` here. Hub-related logic is covered through `@/utils/host/translate/__tests__/` and `@/utils/config/__tests__/`. Live provider tests respect `SKIP_FREE_API=true`.

### Common Patterns

- `useAtom`/`useAtomValue`/`useSetAtom` from `jotai` against `../atoms` and `configFieldsAtomMap`.
- shadcn primitives (`Select`, `Button`, `Textarea`, `Empty`, etc.) imported from `@/components/ui/base-ui/*`.
- Provider iconography via `<ProviderIcon logo={PROVIDER_ITEMS[provider].logo(theme)} ... />`.
- React Query `useMutation` for translation calls, with stale-response guarding through a ref counter.

## Dependencies

### Internal

- `../atoms` — every hub-scoped piece of state.
- `@/utils/atoms/config` — `configFieldsAtomMap` (language, providersConfig, translate, languageDetection).
- `@/utils/config/helpers` — `getProviderConfigById`, `getTranslateProvidersConfig`, `filterEnabledProvidersConfig`, `getLLMProvidersConfig`, `getNonAPIProvidersConfig`, `getPureAPIProvidersConfig`.
- `@/utils/constants/providers` — `PROVIDER_ITEMS` for icons.
- `@/utils/constants/prompt` — `DEFAULT_TRANSLATE_PROMPT_ID`.
- `@/utils/host/translate/execute-translate` — the translation entry point.
- `@/utils/prompts/translate` — `getTranslatePrompt` resolver.
- `@/utils/content/language` — `detectLanguage`.
- `@/utils/analytics` — `trackFeatureAttempt`, `createFeatureUsageContext`.
- `@/components/language-combobox`, `@/components/provider-icon`, `@/components/providers/theme-provider`, and `@/components/ui/base-ui/*`.

### External

- `jotai` — atom hooks.
- `@tanstack/react-query` — `useMutation` for translate calls.
- `@iconify/react`, `@tabler/icons-react` — iconography.
- `debounce` — debounced input-language detection.
- `sonner` — toast notifications.
- `#imports` — `i18n` and `browser` (used to open the API providers page).

<!-- MANUAL: -->
