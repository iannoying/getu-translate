<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# src

## Purpose

Source root of `@getu/db`. Exposes two things: the `createDb(d1OrBetterSqlite)` factory and the `schema` namespace. No build step — consumers import `"@getu/db"` and the bundler resolves to TS directly.

## Key Files

| File           | Description                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `index.ts`     | Barrel: re-exports `createDb`, `Db`, and `schema` (namespace from `./schema`).                                     |
| `client.ts`    | `createDb()` — dispatches on input shape: Cloudflare D1 binding → `drizzle(d1)`, or a `better-sqlite3` instance → `drizzle(bettersqlite)`. |

## Subdirectories

| Directory    | Purpose                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `schema/`    | Drizzle table definitions grouped by domain (`auth`, `billing`) (see `schema/AGENTS.md`).                |

## For AI Agents

- **`createDb` accepts both runtimes** so tests can exercise real Drizzle queries against in-memory SQLite. Preserve that dual-mode contract.
- Export new schemas via `schema/index.ts` — consumers reach tables as `schema.<domain>.<table>`.
- Never import provider-specific types (D1-specific or sqlite-specific) in consumer code; stick to the `Db` alias.

<!-- MANUAL: -->
