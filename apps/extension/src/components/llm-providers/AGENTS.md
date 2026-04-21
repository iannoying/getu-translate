<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# llm-providers

## Purpose

UI for picking an LLM / translation provider out of the user-configured list (`ProviderConfig[]` from `@/types/config/provider`). Renders the trigger and dropdown via `ui/base-ui/select`, draws each item with the shared `ProviderIcon` (theme-aware logo lookup against `PROVIDER_ITEMS`), and automatically switches to a grouped layout that splits "AI Translator" (LLM) vs "Normal Translator" (pure translate) entries when both kinds coexist.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider-selector.tsx` | Default-exports `ProviderSelector`. Detects whether any pure-translate providers are present (`isPureTranslateProviderConfig`) to choose between `TranslateGroupedSelect` and `FlatSelect`; both branches use `Select<ProviderConfig>` with `itemToStringValue={p => p.id}`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Resolve provider logos through `PROVIDER_ITEMS[provider.provider].logo(theme)` - never hard-code paths; the `theme` from `useTheme()` is required for dual-theme assets.
- The grouped vs flat decision is purely based on the input list: if you add a new provider category, also extend `isLLMProviderConfig`/`isPureTranslateProviderConfig` in `@/types/config/provider`.
- `selectContentProps` exists so the consumer can portal the select content into a specific shadow-host container (`container`) and pass `positionerClassName` for selection-popover-like overlays. Keep that escape hatch when adding new wrappers.
- `disabled={providers.length === 0}` is intentional in `FlatSelect`; preserve it so the trigger isn't clickable when nothing is configured.

### Testing Requirements

- Vitest + `@testing-library/react`. Mock `useTheme` and `PROVIDER_ITEMS`; render with both LLM-only and mixed lists to cover both render branches. Assert `onChange` is called with the provider `id`, never the full object.

### Common Patterns

- Generic `Select<ProviderConfig>` keeps the source-of-truth shape; `itemToStringValue` adapter avoids string-id maps elsewhere.
- Internal helper components (`TranslateGroupedSelect`, `FlatSelect`) are not exported; inline so the selector remains a single mental unit.

## Dependencies

### Internal

- `@/components/provider-icon` - shared logo + name renderer.
- `@/components/providers/theme-provider#useTheme` - resolves theme-aware logo URLs.
- `@/components/ui/base-ui/select` - all select primitives.
- `@/types/config/provider` - `ProviderConfig`, `isLLMProviderConfig`, `isPureTranslateProviderConfig`.
- `@/types/config/theme` - `Theme` type.
- `@/utils/constants/providers#PROVIDER_ITEMS` - provider catalog.

### External

- `#imports` (WXT) - `i18n.t` for group labels.

<!-- MANUAL: -->
