<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

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
| `src/schema/`        | Table definitions (`auth.ts`, `billing.ts`) and `index.ts` barrel.                                              |
| `src/schema/__tests__/` | Schema shape / invariants tests.                                                                              |
| `drizzle/`           | Generated SQL migrations (`0000_init.sql`, `0001_billing.sql`, `0002_paddle_provider.sql`, `0003_passkey.sql`). |
| `drizzle/meta/`      | Drizzle-Kit metadata — DO NOT hand-edit.                                                                        |

## For AI Agents

### Working In This Directory

- **Migrations are append-only.** Never edit a previously-released `drizzle/NNNN_*.sql` — generate a new one via `drizzle-kit generate`.
- **Schema additions must update both `src/schema/*.ts` AND produce a new migration.** Tests in `src/schema/__tests__/` verify the TS shape; the SQL file verifies the on-disk format.
- When adding a new table, re-export it from `src/schema/index.ts` so consumers can access via `schema.<name>`.
- **SQLite-only** — no Postgres-specific types (no `jsonb`, `uuid`, server-side `now()`). Use `text`, `integer`, `blob`, and `integer` for timestamps (unix ms).
- Foreign keys and cascading deletes are enforced by SQL migrations, not by Drizzle relations — keep both in sync.

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
