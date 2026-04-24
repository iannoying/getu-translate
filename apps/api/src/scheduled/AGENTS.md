<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# scheduled

## Purpose

Cron-triggered jobs run by the Worker's `scheduled` handler (`src/worker.ts`). Currently: usage-row retention.

## Key Files

| File                       | Description                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `retention.ts`             | `runRetention(db, { now, retentionDays })` — deletes usage rows older than the retention window.        |
| `__tests__/retention.test.ts` | Verifies boundary behaviour (`now - retentionDays*24h`) against an in-memory DB.                     |

## For AI Agents

- Scheduled jobs must be idempotent and safe to re-run. Retention simply deletes — re-running is a no-op.
- Keep runtime bounded; D1 requests have a latency budget. Batch/limit deletes if the row count grows.
- Register new jobs in `src/worker.ts` alongside retention, each with its own file and test.

<!-- MANUAL: -->
