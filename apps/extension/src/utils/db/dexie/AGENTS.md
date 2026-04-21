<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# dexie

## Purpose

Defines the extension's single IndexedDB database (`<AppName>DB`) via Dexie, exposing four `EntityTable`s: `translationCache`, `batchRequestRecord`, `articleSummaryCache`, and `aiSegmentationCache`. The `db` singleton is imported by the background request pipeline, page-translation flows, and the subtitle/summary processors to memoize expensive AI/HTTP work keyed by SHA-256 hashes of `(content, providerConfig)`.

## Key Files

| File           | Description                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.ts`        | Exports `db = new AppDB()` — the one-and-only Dexie instance the rest of the codebase imports.                                                                                                                                                                  |
| `app-db.ts`    | `AppDB extends Dexie` — declares typed `EntityTable<...>` properties, sets database name to `${upperCamelCase(APP_NAME)}DB`, registers four append-only schema versions, and `mapToClass()`-binds each table to its entity class.                               |
| `mock-data.ts` | `generateMockBatchRequestRecords()` / `clearMockData()` — uses `@faker-js/faker` to seed `batchRequestRecord` for dev/QA of the request-history dashboard; sizes default to `REQUEST_RECORD_MAX_COUNT` / `REQUEST_RECORD_MAX_AGE_DAYS` from the bg cleanup job. |

## Subdirectories

| Directory | Purpose                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tables/` | One `Entity`-subclass file per Dexie table (`translation-cache.ts`, `batch-request-record.ts`, `article-summary-cache.ts`, `ai-segmentation-cache.ts`); each declares the indexed fields as class properties. |

## For AI Agents

### Working In This Directory

- Dexie schema versions in `app-db.ts` are append-only. Adding a column means: (1) add a new `this.version(N).stores({...})` block including all prior tables; (2) NEVER mutate `version(1..N-1)` — Dexie replays them on first open for older installs.
- When introducing a new table: create a new file under `tables/`, subclass `Entity`, declare its primary key as the first index in the `stores({...})` schema string, and call `this.<table>.mapToClass(<Class>)` in the constructor.
- Cache keys are SHA-256 hex (see `Sha256Hex` from `@/utils/hash`) of canonical inputs (text + serialized providerConfig). Don't change the hashing recipe without a migration plan — old cache rows become unreachable.
- The DB name is derived from `APP_NAME` via `case-anything`'s `upperCamelCase`. Keep it stable; renaming `APP_NAME` would orphan every user's existing DB.
- `mock-data.ts` imports from `@/entrypoints/background/db-cleanup` for size limits — keep mock generation aligned with the real eviction thresholds so dev data exercises the cleanup path.

### Testing Requirements

- Vitest with `fake-indexeddb` (typically wired in test setup). No `SKIP_FREE_API` involvement — these tests are pure storage round-trips.
- When adding a schema version, write a test that opens the DB twice (cold + warm) to ensure the upgrade path runs without throwing.

### Common Patterns

- Each table entity has a `key: string` primary key plus `createdAt: Date` for TTL eviction by `db-cleanup`.
- Indexed columns are declared in the `stores` schema string AND mirrored as `Entity` class properties in `tables/<name>.ts`.
- All cache writes are fire-and-forget from the bg request pipeline; readers fall back gracefully on cache miss.

## Dependencies

### Internal

- `@/utils/constants/app` (`APP_NAME`) — DB-name source
- `@/entrypoints/background/db-cleanup` (mock-data only) — size constants

### External

- `dexie` — IndexedDB wrapper providing `Dexie`, `EntityTable`, `Entity`
- `case-anything` — `upperCamelCase` for the DB name
- `@faker-js/faker` (mock-data only) — synthetic record generation

<!-- MANUAL: -->
