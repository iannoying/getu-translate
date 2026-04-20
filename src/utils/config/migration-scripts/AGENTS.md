<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# migration-scripts

## Purpose

Holds one frozen `vN-to-v(N+1).ts` snapshot per `CONFIG_SCHEMA_VERSION` bump (currently `v001-to-v002.ts` through `v066-to-v067.ts`). Each module exports a pure `migrate(oldConfig: any): any` function that receives the previous version's shape and returns the next version's shape. `../migration.ts` discovers them via `import.meta.glob('./migration-scripts/v*-to-v*.ts')` and runs them sequentially.

## Key Files

| File                 | Description                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`           | `MigrationFunction = (oldConfig: any) => any`, `MigrationModule { migrate }`, `MigrationInfo { fromVersion, toVersion, description? }` — the only shared type surface, intentionally `any` to decouple from any live schema.                                                          |
| `v001-to-v002.ts`    | Earliest example — adds `pageTranslate.range = 'mainContent'` via `deepmerge`.                                                                                                                                                                                                        |
| `v066-to-v067.ts`    | Latest example at time of writing — renames `{{webTitle}} → {{videoTitle}}` / `{{webSummary}} → {{videoSummary}}` inside `videoSubtitles.customPromptsConfig.patterns`; the inline doc-comment explicitly reminds future authors that values are hardcoded and migrations are frozen. |
| `v002-to-v066-...ts` | 65 intermediate, frozen migrations — additive field changes, renames, prompt-token migrations, etc. Treat as historical artifacts.                                                                                                                                                    |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- READ THE SKILL FIRST: `.agents/skills/migration-scripts/SKILL.md`. It defines the frozen-snapshot rule, registry safety, and import-boundary rules that govern this directory.
- Migrations are FROZEN SNAPSHOTS. Once a `vN-to-v(N+1).ts` file ships, it is never edited. If you find a bug in an old migration, you write a new corrective migration at the head of the chain — you do not mutate the existing file.
- NEVER `import` live schemas, live constants, live default configs, or live helpers into a migration. All values must be hardcoded inline (see the explicit comment block at the top of `v066-to-v067.ts`). Any live import would tie the migration to current code and break replay for users on old versions.
- Filenames must match `v\d+-to-v(\d+)\.ts` exactly — `migration.ts` parses the target version from the filename. A typo throws "Invalid migration filename" at module load.
- To add a migration: (1) bump `CONFIG_SCHEMA_VERSION` in `@/utils/constants/config`; (2) create `vN-to-v(N+1).ts` exporting `migrate`; (3) update `configSchema` in `@/types/config/config`; (4) write a Vitest case feeding the previous version's default through the new migration and asserting the next schema parses.
- The signature is `(oldConfig: any) => any` and stays `any` on purpose — narrowing it to a typed `Config` would silently rebind the migration to the latest schema and defeat replay.
- Use `deepmerge` (from `deepmerge-ts`) only when you mean to additively merge defaults; for renames/structural rewrites, build a new object explicitly with spreads (see `v066-to-v067.ts`).

### Testing Requirements

- Vitest, co-located via the parent `config/__tests__/` suite. Each migration should have a focused test that pipes the prior version's expected shape into `migrate()` and validates the output against the new schema.
- These tests are pure — no `SKIP_FREE_API`, no network.
- Never delete or "clean up" old migration tests. They guard the replay path for any user upgrading from any historical version.

### Common Patterns

- Defensive null/undefined guards on nested fields (`config?.videoSubtitles`, `Array.isArray(config.patterns)`) — the input shape is whatever shipped at version N, including legacy edge cases.
- Spread-based immutable updates: `{ ...oldConfig, foo: { ...oldConfig.foo, ... } }`.
- Inline hardcoded literals for any token, key name, default, or constant. No imports from `@/utils/constants/*` or similar.
- Top-of-file doc comment summarizing the change and reiterating the frozen-snapshot rule (see `v066-to-v067.ts` as the template).

## Dependencies

### Internal

- `./types` only. Migrations must NOT import from `@/types/config/*`, `@/utils/constants/*`, or any live module.

### External

- `deepmerge-ts` — used by some migrations for additive default merging. Pinned, behavior-stable; safe to keep using.

<!-- MANUAL: -->
