<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-26 -->

# db

## Purpose

`@getu/db` — Shared Drizzle ORM schema + client factory over **Cloudflare D1** (SQLite). Consumed primarily by `@getu/api`; also imported by tests that need an in-memory SQLite via `better-sqlite3`.

The package owns both the TypeScript schema (`src/schema/`) and the generated migrations (`drizzle/`). No build step — consumers import raw TS via `"main": "./src/index.ts"`.

Exports:
- `createDb(d1)` — returns a Drizzle client bound to the given D1 (or better-sqlite3) database.
- `schema` (namespace) — all tables and relations (`schema.auth.*`, `schema.billing.*`).

## Key Files

| File                       | Description                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `package.json`             | `@getu/db` manifest. No build step; `test` runs vitest.                                                          |
| `drizzle.config.ts`        | Drizzle-Kit config — schema path, migration dialect (sqlite), out dir (`drizzle/`).                              |
| `tsconfig.json`            | TS config.                                                                                                       |
| `README.md`                | Short placeholder from Phase 2 intro.                                                                            |
| `src/index.ts`             | Barrel: re-exports `createDb`, `Db`, and `schema`.                                                               |
| `src/client.ts`            | `createDb()` — picks `drizzle(d1)` (D1 binding) or `drizzle(bettersqlite)` (tests) based on input shape.         |

## Subdirectories

| Directory            | Purpose                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/schema/`        | Table definitions (`auth.ts`, `billing.ts`, `translate.ts`) and `index.ts` barrel.                              |
| `src/schema/__tests__/` | Schema shape / invariants tests.                                                                              |
| `drizzle/`           | Generated SQL migrations (`0000_init.sql`, `0001_billing.sql`, `0002_paddle_provider.sql`, `0003_passkey.sql`, `0004_translate.sql`). |
| `drizzle/meta/`      | Drizzle-Kit metadata — DO NOT hand-edit. **Note: `0002_snapshot.json` and `0003_snapshot.json` were never committed when those migrations were authored, so the snapshot chain has a gap (0001 → 0004 directly). See "Snapshot chain gap" below.** |
| `package.json`'s `check:meta` | Runs `drizzle-kit generate` and fails if it would produce any new output — guards against schema/snapshot drift on every PR via `pnpm --filter @getu/db check:meta`. |

## For AI Agents

### Working In This Directory

- **Migrations are append-only.** Never edit a previously-released `drizzle/NNNN_*.sql` — generate a new one via `drizzle-kit generate`.
- **Schema additions must update both `src/schema/*.ts` AND produce a new migration.** Tests in `src/schema/__tests__/` verify the TS shape; the SQL file verifies the on-disk format.
- When adding a new table, re-export it from `src/schema/index.ts` so consumers can access via `schema.<name>`.
- **SQLite-only** — no Postgres-specific types (no `jsonb`, `uuid`, server-side `now()`). Use `text`, `integer`, `blob`, and `integer` for timestamps (unix ms).
- Foreign keys and cascading deletes are enforced by SQL migrations, not by Drizzle relations — keep both in sync.
- **After every schema change**, run `pnpm --filter @getu/db check:meta` locally. If it fails, your schema diverged from the latest snapshot — run `pnpm --filter @getu/db generate` to produce a new migration, commit both the SQL file AND the new `meta/NNNN_snapshot.json`, then re-run check.

### Snapshot chain gap (0002, 0003)

`drizzle/meta/` is missing `0002_snapshot.json` and `0003_snapshot.json` — the original authors of those migrations committed only the SQL files. As a result `0004_snapshot.json`'s `prevId` points at `0001_snapshot.json` (skipping two), and the snapshot chain is broken between 0001 and 0004.

**This is documented but NOT fixed**, because:

1. **Runtime is unaffected.** `_journal.json` lists all 5 entries (0000-0004); migration appliers (D1, `apps/api/src/__tests__/utils/test-db.ts`) iterate the journal and apply the SQL files in order. 145+ tests run end-to-end against a freshly-migrated in-memory DB on every CI run, which is the strongest possible regression guard.
2. **Forward generation works.** `drizzle-kit generate` compares the schema to the latest snapshot (0004) only, so new migrations (0005+) chain off 0004 correctly. The `check:meta` script enforces this.
3. **Reconstructing 0002/0003 snapshots would be error-prone.** They were never written to git, drizzle-kit's snapshot format is complex internal JSON, and hand-rolling them risks introducing subtle mismatches that break future generates.
4. **Rollback (`drizzle-kit drop`) is the only affected workflow** — and the team uses D1 + wrangler CLI which is forward-only. We don't roll back schema, we ship a new migration that undoes the change.

If a future workflow ever needs the historical chain (e.g. `drizzle-kit drop` for local dev), reconstruct by checking out the commit immediately before each missing migration, regenerating the snapshot, and force-merging it.

### Testing Requirements

- `pnpm --filter @getu/db test` runs schema tests.
- In consuming packages, spin up a fresh in-memory DB via `createDb(new Database(":memory:"))` and apply migrations before running tests.

### Common Patterns

- Tables live in domain-scoped files (`auth.ts`, `billing.ts`), not one monolithic schema.
- Every table has `createdAt` / `updatedAt` stored as unix-ms integers.
- Prefer Drizzle relations + `with` clauses over manual joins in consumers.

## Dependencies

### External

- `drizzle-orm` — ORM runtime.
- `drizzle-kit` — migration generator (dev-only).
- `@cloudflare/workers-types` — D1 types.
- `better-sqlite3` — dev/test driver for in-memory SQLite.
- `vitest` — tests.

<!-- MANUAL: -->
