<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# drizzle

## Purpose

Generated SQL migrations produced by `drizzle-kit` from `src/schema/*.ts`. Applied to Cloudflare D1 (prod) and to in-memory `better-sqlite3` (tests). Append-only.

## Key Files

| File                         | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `0000_init.sql`              | Initial better-auth schema (`user`, `session`, `account`, `verification`). |
| `0001_billing.sql`           | `user_entitlements` + usage/quota tables.                                |
| `0002_paddle_provider.sql`   | Extends entitlements with Paddle linkage columns.                         |
| `0003_passkey.sql`           | Passkey table for WebAuthn sign-in.                                      |

## Subdirectories

| Directory  | Purpose                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `meta/`    | Drizzle-Kit metadata / journal. **DO NOT hand-edit** — regenerated together with migrations.                              |

## For AI Agents

- **Never modify an existing migration.** If a column needs changing, generate a new migration that alters/renames.
- To add a migration: update `src/schema/*.ts` → run `pnpm drizzle-kit generate` (from this package) → commit the new `NNNN_*.sql` + updated `meta/`.
- Keep SQL SQLite-compatible (no `ALTER TABLE ... ALTER COLUMN`; drop-and-recreate with a copy if needed).
- Verify locally via tests that bootstrap an in-memory DB and apply all migrations in order before asserting schema shape.

<!-- MANUAL: -->
