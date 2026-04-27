<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-27 -->

# scheduled

## Purpose

Cron-triggered jobs run by the Worker's `scheduled` handler (`src/worker.ts`). Covers two concerns: (1) data-retention (deleting old rows) and (2) translation-job lifecycle maintenance — cleanup of expired jobs, retry of transiently-failed jobs, and unsticking stalled processors.

## Key Files

| File                         | Description                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `retention.ts`               | `runRetention(db, { now, retentionDays })` — deletes usage rows older than the retention window.                                                                                     |
| `translation-cleanup.ts`     | `runTranslationCleanup(db, bucket, { now, dryRun? })` — deletes expired `text_translations` (Free-tier, non-null `expires_at`) and finished/failed `translation_jobs` past retention; purges corresponding R2 objects. |
| `translation-retry.ts`       | `runTranslationRetry(db, queue, { now, dryRun? })` — re-enqueues `translation_jobs` that failed with retriable `error_code` values (`transient_llm`, `r2_timeout`, `output_write`) within the past 1 hour; caps at 100 retries/tick. |
| `translation-stuck-sweep.ts` | `runTranslationStuckSweep(db, { now, dryRun? })` — marks jobs stuck in `processing` for > 30 min as `failed` with `error_code = transient_llm` so the retry job can pick them up.   |

## For AI Agents

- All jobs must be **idempotent** — safe to re-run within the same cron window without double-deleting or double-retrying.
- Each job accepts a `dryRun` flag: reads but does not write. Use it in tests to verify selection logic independently of side effects.
- Keep runtime bounded: D1 has a latency budget. Batch/limit row counts (retry caps at 100/tick; cleanup paginates if needed).
- `translation-retry.ts` requires the `TRANSLATION_QUEUE` binding; it returns early if `queue` is `undefined` (e.g., in test environments).
- Register new jobs in `src/worker.ts`; add a vitest under `scheduled/__tests__/` that exercises the job against an in-memory DB via `src/__tests__/utils/test-db.ts`.

<!-- MANUAL: -->
