<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# schema

## Purpose

Drizzle table definitions, split by domain. Consumers import via the `schema` namespace barrel (`import { schema } from "@getu/db"` → `schema.user`, `schema.userEntitlements`, ...). SQLite / D1 only.

## Key Files

| File          | Description                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`    | Barrel: `export * from "./auth"` + `export * from "./billing"`.                                                                            |
| `auth.ts`     | better-auth tables — `user`, `session`, `account`, `verification`, plus passkey. Keep field names in sync with better-auth expectations.   |
| `billing.ts`  | `userEntitlements` (per-user tier, features, provider linkage, `graceUntil`) + quota/usage log tables. Append-only usage log, idempotent via `(userId, requestId)`. |

## Subdirectories

| Directory      | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| `__tests__/`   | Shape / relation / default-value tests run via vitest.              |

## For AI Agents

- **Timestamps are unix-ms integers** via `{ mode: "timestamp_ms" }`. Defaults use the `unixMsDefault` helper.
- **Do not use `CASCADE` when it would break billing audits.** `usage` keeps `userId` nullable with `ON DELETE SET NULL` — preserve that pattern for audit-relevant rows.
- **Enum columns** (`tier`, `billingProvider`) are declared inline. Keep the TS enum and the DB enum in sync with the migration SQL.
- **Never change column types in place.** Add a migration that renames/backfills instead.
- `features` stores a JSON string (text) — the column type is `text` not `json` (SQLite has no JSON type). Parse at the app layer.

<!-- MANUAL: -->
