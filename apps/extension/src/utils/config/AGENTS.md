<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# config

## Purpose

Owns the lifecycle of the extension's persisted Zod-validated `Config` object: bootstrapping defaults on first install, running sequential schema migrations, reading/writing through WXT `storage` with versioned metadata, and reconciling the local snapshot with the last cloud-synced snapshot. Every read path safe-parses through `configSchema` so downstream code can rely on a fully-typed `Config`.

## Key Files

| File           | Description                                                                                                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init.ts`      | `initializeConfig()` — runs once in the background script: loads stored config, walks `runMigration()` to `CONFIG_SCHEMA_VERSION`, writes back, and in `import.meta.env.DEV` injects `WXT_<PROVIDER>_API_KEY` env values plus enables beta experience.                                       |
| `migration.ts` | `migrateConfig()` / `runMigration()` — eager `import.meta.glob` of `./migration-scripts/v*-to-v*.ts`, indexes them by target version, throws `ConfigVersionTooNewError` when stored version exceeds latest.                                                                                  |
| `storage.ts`   | `getLocalConfig` / `setLocalConfig` / `getLocalConfigAndMeta` / `setLocalConfigAndMeta` — typed wrappers over `storage.getItem<Config>('local:CONFIG_STORAGE_KEY')` that always safe-parse and stamp `lastModifiedAt`.                                                                       |
| `sync.ts`      | Reads/writes the `LAST_SYNCED_CONFIG_STORAGE_KEY` snapshot used by Google Drive sync; runs an on-the-fly `migrateConfig()` so a stale cloud snapshot is upgraded to the current schema before diffing.                                                                                       |
| `helpers.ts`   | Pure selectors over `ProvidersConfig` (`getProviderConfigById`, `getLLMProvidersConfig`, `getEnabledLLMProvidersConfig`, etc.) plus fallback-computation helpers used when a provider is deleted (`computeProviderFallbacksAfterDeletion`, `computeLanguageDetectionFallbackAfterDeletion`). |
| `api.ts`       | `getObjectWithoutAPIKeys()` / `hasAPIKey()` — recursive scrubbing/detection of the `apiKey` field, used before logging or syncing config.                                                                                                                                                    |
| `languages.ts` | `getFinalSourceCode()` and `getDetectedCodeFromStorage()` — collapses `"auto"` to the per-tab detected ISO 639-3 code persisted under `DETECTED_CODE_STORAGE_KEY`.                                                                                                                           |
| `errors.ts`    | `ConfigVersionTooNewError` — thrown when local DB sees a config newer than this build's schema version.                                                                                                                                                                                      |

## Subdirectories

| Directory            | Purpose                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `migration-scripts/` | One frozen `vN-to-vN+1.ts` snapshot per schema bump (see `migration-scripts/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- The schema source of truth is `@/types/config/config` (`configSchema`) plus `CONFIG_SCHEMA_VERSION` from `@/utils/constants/config`. Bumping the schema requires both a constant bump and a new migration file in `migration-scripts/`.
- Never call `setLocalConfig` from a content script outside the bg-orchestrated flow — `initializeConfig()` is meant to run exactly once on background startup. Other contexts read via `getLocalConfig()` and mutate through messaging or Jotai atoms.
- `init.ts` swallows individual migration failures (`console.error` + advances version) so a single broken step never bricks startup; if you change this, audit downstream behavior in `applyAPIKeysFromEnv` / `applyDevBetaExperience`.
- `sync.ts` runs `migrateConfig()` on the cloud snapshot every read — never persist a partially migrated cloud snapshot back to `LAST_SYNCED_CONFIG_STORAGE_KEY`.
- `getObjectWithoutAPIKeys()` is the only correct helper to scrub config before logging, telemetry, or sync diffs. Use `hasAPIKey()` instead of ad-hoc `JSON.stringify(config).includes('apiKey')`.
- `helpers.ts` is the canonical place for new provider-list selectors; keep them as pure functions over `ProvidersConfig` and lean on the type guards from `@/types/config/provider`.

### Testing Requirements

- Vitest, with co-located `__tests__/` next to source. Tests for migration sequencing, storage round-trips, and helper selectors live there.
- Migrations are tested per-version; do not mock or stub the schema — feed the previous version's actual default config into the migration and assert the next version's parse succeeds.
- These tests run with neither `SKIP_FREE_API` nor live network; they're pure CPU.

### Common Patterns

- Versioned storage: every write to `CONFIG_STORAGE_KEY` is paired with `storage.setMeta({ schemaVersion, lastModifiedAt })`. Always update the meta in the same logical step.
- Safe-parse-or-default: every read either returns the parsed `Config`, returns `null`/throws explicitly, or falls back to `DEFAULT_CONFIG` after logging.
- Sequential migrations: `originalConfigSchemaVersion → ... → CONFIG_SCHEMA_VERSION` one step at a time, never jumping versions.

## Dependencies

### Internal

- `@/types/config/config` (`configSchema`, `Config`), `@/types/config/meta`, `@/types/config/provider`
- `@/utils/constants/config` (`CONFIG_SCHEMA_VERSION`, `CONFIG_STORAGE_KEY`, `LAST_SYNCED_CONFIG_STORAGE_KEY`, `DEFAULT_CONFIG`, `DETECTED_CODE_STORAGE_KEY`)
- `@/utils/constants/feature-providers` (`FEATURE_KEYS`, `FEATURE_PROVIDER_DEFS`) for fallback logic
- `@/utils/logger`

### External

- `#imports` from WXT — `storage` (typed `local:` namespace) and `i18n` for migration error messages
- `zod` (transitive via `configSchema`) — schema validation

<!-- MANUAL: -->
