<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# constants

## Purpose

Single home for every app-wide constant, default, storage key, and prompt template Read Frog ships. Anything imported by more than one module — schema versions, default config, provider catalog, prompt token names, DOM data-attribute names, hotkey definitions, subtitle limits, TTS defaults, URL bases — lives here. Keeps magic numbers and string literals out of feature code and lets schema migrations / atoms / sync stay coordinated against a single canonical key.

## Key Files

| File                         | Description                                                                                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`                  | `CONFIG_STORAGE_KEY`, `LAST_SYNCED_CONFIG_STORAGE_KEY`, `THEME_STORAGE_KEY`, `DETECTED_CODE_STORAGE_KEY`, `GOOGLE_DRIVE_TOKEN_STORAGE_KEY`, `CONFIG_SCHEMA_VERSION` (currently `67`), and the canonical `DEFAULT_CONFIG` composed from every other defaults file in this directory. |
| `storage-keys.ts`            | `TRANSLATION_STATE_KEY_PREFIX` + `getTranslationStateKey(tabId)` — the only per-tab session-storage key Read Frog uses.                                                                                                                                                             |
| `app.ts`                     | `APP_NAME = "Read Frog"`, `EXTENSION_VERSION` from `browser.runtime.getManifest().version`.                                                                                                                                                                                         |
| `dom-labels.ts`              | All `data-read-frog-*` attributes / classes used to mark walked nodes, paragraphs, blocks, inline content, the React-shadow host, the `notranslate` opt-out, and translation error containers.                                                                                      |
| `dom-rules.ts`               | `FORCE_BLOCK_TAGS`, `MATH_TAGS`, `DONT_WALK_AND_TRANSLATE_TAGS`, `DONT_WALK_BUT_TRANSLATE_TAGS`, `FORCE_INLINE_TRANSLATION_TAGS`, `MAIN_CONTENT_IGNORE_TAGS`, plus `CUSTOM_*_SELECTOR_MAP` entries for site-specific overrides.                                                     |
| `feature-providers.ts`       | `FEATURE_KEYS` enum (`translate`, `videoSubtitles`, `selectionToolbar.translate`, `inputTranslation`), `FEATURE_PROVIDER_DEFS` mapping each to a `getProviderId` + `configPath`, plus `resolveProviderConfig(OrNull)` and `buildFeatureProviderPatch` helpers.                      |
| `prompt.ts`                  | Token names (`TARGET_LANGUAGE`, `INPUT`, `WEB_TITLE`/`WEB_CONTENT`/`WEB_SUMMARY`, `VIDEO_TITLE`/`VIDEO_SUMMARY`), `getTokenCellText` (`{{token}}`), `BATCH_SEPARATOR`, and the `DEFAULT_*_SYSTEM_PROMPT` / `DEFAULT_*_PROMPT` strings used everywhere in `utils/prompts/`.          |
| `models.ts`                  | `LLM_PROVIDER_MODELS`, `NON_API_TRANSLATE_PROVIDERS`, `PURE_TRANSLATE_PROVIDERS`, `LLM_MODEL_OPTIONS`, GPT-5 reasoning-effort policy.                                                                                                                                               |
| `providers.ts`               | `DEFAULT_LLM_PROVIDER_MODELS`, `PROVIDER_ITEMS` (logo + name + website per provider), `DEFAULT_PROVIDER_CONFIG_LIST`, plus filtered exports (`TRANSLATE_PROVIDER_ITEMS`, `LLM_PROVIDER_ITEMS`, …) and the connection-options field schema.                                          |
| `translate.ts`               | Token-bucket defaults (`DEFAULT_REQUEST_RATE = 8`, `DEFAULT_REQUEST_CAPACITY = 60`), batch defaults (`MAX_CHARACTER_PER_BATCH = 1000`, `MAX_ITEMS_PER_BATCH = 4`), preload thresholds, `DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY = "Alt+E"`, and per-node minimums.                      |
| `translation-node-style.ts`  | `TRANSLATION_NODE_STYLE` tuple + `CUSTOM_TRANSLATION_NODE_ATTRIBUTE`.                                                                                                                                                                                                               |
| `subtitles.ts`               | YouTube selectors / event names, navigation/fetch timeouts, segmentation limits (`MAX_WORDS = 15`, `MAX_CHARS_CJK = 30`, `SENTENCE_END_PATTERN`), translation lookahead windows, and DOM IDs/classes.                                                                               |
| `tts.ts`                     | `DEFAULT_TTS_CONFIG`.                                                                                                                                                                                                                                                               |
| `selection.ts`               | `MARGIN`, opacity bounds + `DEFAULT_SELECTION_OVERLAY_OPACITY`.                                                                                                                                                                                                                     |
| `side.ts`                    | Side-panel width + paragraph depth + the markdown templates (`AST_TEMPLATE`, `SENTENCE_TEMPLATE`, `WORDS_TEMPLATE`) used to render explanations.                                                                                                                                    |
| `hotkeys.ts`                 | `HOTKEYS` tuple plus `HOTKEY_ICONS` / `HOTKEY_EVENT_KEYS` lookups.                                                                                                                                                                                                                  |
| `analytics.ts`               | `ANALYTICS_ENABLED_STORAGE_KEY`, `ANALYTICS_INSTALL_ID_STORAGE_KEY`, `ANALYTICS_FEATURE_USED_EVENT`, `getDefaultAnalyticsEnabled()` (off for Firefox per AMO policy), `DEFAULT_ANALYTICS_ENABLED`.                                                                                  |
| `backup.ts`                  | `MAX_BACKUPS_COUNT = 8`, `BACKUP_ID_PREFIX`, `BACKUP_INTERVAL_MINUTES = 60`.                                                                                                                                                                                                        |
| `proxy-fetch.ts`             | `DEFAULT_PROXY_CACHE_TTL_MS = 24h`.                                                                                                                                                                                                                                                 |
| `url.ts`                     | `OFFICIAL_SITE_URL_PATTERNS` for `permissions`/`host_permissions` and the live `WEBSITE_URL` (dev vs. prod resolution).                                                                                                                                                             |
| `custom-action.ts`           | `ICON_PATTERN`, `DEFAULT_ACTION_NAME`, output-schema field helpers (`createOutputSchemaField`, `getNextOutputFieldName`, `getOutputSchemaFieldNameError`, …), `SELECTION_TOOLBAR_CUSTOM_ACTION_TOKENS` + `getSelectionToolbarCustomActionTokenCellText`.                            |
| `custom-action-templates.ts` | Built-in action templates (e.g. `dictionary`) seeded into `DEFAULT_CONFIG`.                                                                                                                                                                                                         |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Bumping `CONFIG_SCHEMA_VERSION` requires a migration.** Add a registered migration in `src/utils/config/migration-scripts/` before changing this number, otherwise installed users will silently fall back to defaults on next read.
- **Storage keys live here, not where they're used.** `auth/`, `backup/`, `atoms/`, `google-drive/` and the WXT entrypoints all import from this directory — never inline `local:foo`/`session:foo` literals.
- **`DEFAULT_CONFIG` is the only Source-of-Truth defaults object.** When adding a new top-level config field, default it here and add a migration in the same commit. Atoms in `utils/atoms/config.ts` derive their field map from this object.
- **Prompt constants are user-overridable.** `getTranslatePromptFromConfig` (in `utils/prompts/translate.ts`) only falls back to these when no custom prompt id is set; if you reword the defaults, also update the migration that re-seeds them when `customPromptsConfig` is empty.
- **Add new providers in three places at once:** `models.ts` (LLM_MODEL_OPTIONS), `providers.ts` (PROVIDER_ITEMS + DEFAULT_PROVIDER_CONFIG_LIST), and `feature-providers.ts` if the feature accepts the new provider type.
- **Do not import this directory from a build-time config (`wxt.config.ts`) without verifying tree-shaking** — `prompt.ts` alone pulls multi-KB strings.

### Testing Requirements

- Tests live in `constants/__tests__/`. Snapshot the migrated `DEFAULT_CONFIG` shape after schema bumps to catch unintentional drift.

### Common Patterns

- **Co-locate defaults next to enum.** Each constants file owns both the `_TUPLE`/`MAP` and its `DEFAULT_*`, so consumers import a single module instead of stitching two.
- **Storage keys are exported as readonly string constants** (not enums) so they can be used in template literal types like `local:${typeof KEY}`.

## Dependencies

### Internal

- Imports from `@/types/config/*` for `Config` shape and provider/theme/translate sub-schemas.
- `@/utils/atoms/config` (only for `mergeWithArrayOverwrite` reuse in `feature-providers.ts`).
- `@/utils/config/helpers` — `getProviderConfigById`.

### External

- `@read-frog/definitions` — domain constants (`READFROG_DOMAIN`, `WEBSITE_PROD_URL`, `WEBSITE_CADDY_DEV_URL`, `LOCALHOST_DOMAIN`).
- `#imports` (WXT) — `browser` (only in `app.ts` for the runtime version).
- `lodash`'s `pick`/`omit` (in `providers.ts`) for derived item maps.

<!-- MANUAL: -->
