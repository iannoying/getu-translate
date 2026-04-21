<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# config

## Purpose

The single source of truth for the user-facing extension configuration. `config.ts` composes per-feature Zod schemas (provider, translate, language detection, tts, subtitles, selection-toolbar, theme, meta) into the top-level `configSchema`, then layers a `superRefine` that enforces cross-feature invariants — every feature's `providerId` must reference an enabled provider of the right kind, language detection in `"llm"` mode requires an enabled LLM provider, and selection-toolbar custom actions must point at LLM providers. Persisted via WXT storage with a separate `ConfigMeta` blob (`schemaVersion`, `lastModifiedAt`).

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`             | Top-level `configSchema` + `Config` type. Composes all feature sub-schemas and runs the cross-feature `superRefine` validation against `FEATURE_PROVIDER_DEFS`. Also defines `floatingButtonSchema`, `selectionToolbarSchema`, `sideContentSchema`, `inputTranslationSchema`, `siteControlSchema`, and `inputTranslationLangSchema`.                                                                                                                                                                                                             |
| `provider.ts`           | The largest module: discriminated unions for every supported provider (`openai`, `anthropic`, `deeplx`, `google-translate`, `microsoft-translate`, `openai-compatible`, `tensdaq`, plus 25+ others). Exports `providerConfigItemSchema`, `providersConfigSchema` (with duplicate-id/name detection), and the type-guard family `isLLMProvider`/`isAPIProvider`/`isPureTranslateProvider`/`isCustomLLMProvider`/etc. Builds per-provider model schemas via `createProviderModelSchema` and `LLM_PROVIDER_MODELS` from `@/utils/constants/models`. |
| `translate.ts`          | `translateConfigSchema` covering page-translation range, auto-translate patterns, preload thresholds, batch/request queue limits, custom translation prompts (with id-uniqueness check), translation-node CSS preset (`translationNodeStyleConfigSchema` capped at `MAX_CUSTOM_CSS_LENGTH = 8192`), and the page-translation shortcut validator.                                                                                                                                                                                                 |
| `tts.ts`                | `ttsConfigSchema` (defaultVoice, languageVoices map, rate/pitch/volume), the static `EDGE_TTS_VOICE_BY_ISO6391` mapping for ~150 ISO-639-1 codes, `EDGE_TTS_FALLBACK_VOICE = "en-US-DavisNeural"`, `getDefaultTTSVoiceForLanguage` and `createDefaultTTSLanguageVoices` factories, and `isKnownEdgeTTSVoice`.                                                                                                                                                                                                                                    |
| `subtitles.ts`          | `videoSubtitlesSchema` for the video subtitle feature: display mode, translation position, font/style sub-schemas, AI-segmentation flag, queue configs, and on-screen `subtitlePositionSchema` (percent + anchor).                                                                                                                                                                                                                                                                                                                               |
| `selection-toolbar.ts`  | Custom AI action schema for the text-selection toolbar: per-action prompt, `outputSchema` array (string/number fields), and an optional Notebase connection with mapping-uniqueness `superRefine`.                                                                                                                                                                                                                                                                                                                                               |
| `language-detection.ts` | `languageDetectionConfigSchema` with `mode: "basic" \| "llm"` and an optional `providerId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `theme.ts`              | `themeModes = ["system", "light", "dark"]`, `themeModeSchema`, and `DEFAULT_THEME_MODE = "system"`.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `meta.ts`               | `ConfigMeta` / `LastSyncedConfigMeta` shapes stored alongside the config in WXT storage (`schemaVersion`, `lastModifiedAt`, `lastSyncedAt`, `email`).                                                                                                                                                                                                                                                                                                                                                                                            |

## Subdirectories

| Directory    | Purpose                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| `__tests__/` | Vitest specs for the schema validators and provider type guards (skipped per instructions). |

## For AI Agents

### Working In This Directory

- `configSchema` is the gate for every persisted user setting — when you add a feature toggle, extend its schema here and add a default in `@/utils/config/default-config.ts` (or wherever defaults live) AND a migration entry, otherwise loading older stored configs throws.
- The cross-field `superRefine` in `config.ts` is the only place that ties feature `providerId` strings to `providersConfig`. New features that pick a provider must register a `FEATURE_PROVIDER_DEFS` entry in `@/utils/constants/feature-providers` instead of duplicating validation here.
- When extending `provider.ts`, update **every** type tuple (`TRANSLATE_PROVIDER_TYPES`, `LLM_PROVIDER_TYPES`, `API_PROVIDER_TYPES`, `ALL_PROVIDER_TYPES`) plus `LLM_PROVIDER_MODELS` in `@/utils/constants/models`. The `as const satisfies Readonly<...>` pattern enforces this at compile time — don't loosen it.
- `openai-compatible` is forced to `isCustomModel: z.literal(true)` because users always supply their own model id; preserve that asymmetry when refactoring `createProviderModelSchema`.
- Don't import from `@/components` or anything React/DOM here — these schemas are loaded from background, content scripts, popup, and options alike.
- For new TTS voice mappings, extend `EDGE_TTS_VOICE_BY_ISO6391` rather than the derived `EDGE_TTS_VOICES` array (the array is computed from the map).

### Testing Requirements

Vitest specs in `__tests__/` should cover schema parsing, type guards, and the `superRefine` cross-feature checks. Use `configSchema.safeParse` and assert on `error.issues[].path` so future schema reorderings don't silently break them.

### Common Patterns

- `z.discriminatedUnion("provider", [...])` for tagged provider configs.
- `superRefine` with `ctx.addIssue({ code, path, message })` for cross-field invariants and uniqueness checks (provider ids/names, custom-action ids/names, output-field ids).
- Re-exporting `LLM_PROVIDER_MODELS` etc. from `@/utils/constants/models` so consumers don't need to know which constants live where.
- `z.infer<typeof xSchema>` to publish the matching TS type next to every schema.

## Dependencies

### Internal

- `@/utils/constants/models` — `LLM_PROVIDER_MODELS`, `NON_API_TRANSLATE_PROVIDERS`, `PURE_TRANSLATE_PROVIDERS`
- `@/utils/constants/feature-providers` — `FEATURE_PROVIDER_DEFS` consumed by `superRefine`
- `@/utils/constants/{translate,subtitles,selection,side,hotkeys,translation-node-style}` — numeric/enum bounds reused in schemas
- `@/utils/page-translation-shortcut` — shortcut string validator

### External

- `zod` — schema definitions and refinements
- `@read-frog/definitions` — `langCodeISO6393Schema`, `langLevel`, `LANG_CODE_ISO6393_OPTIONS`, `ISO6393_TO_6391`

<!-- MANUAL: -->
