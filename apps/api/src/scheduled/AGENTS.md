<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-08 -->

# scheduled

## Purpose

Cron-triggered jobs run by the Worker's `scheduled` handler (`src/worker.ts`). Covers three concerns: (1) data-retention (deleting old usage/translation rows), (2) translation-job lifecycle maintenance — cleanup of expired jobs, retry of transiently-failed jobs, and unsticking stalled processors, and (3) ops alerting — daily spend-bucket threshold checks routed to Slack (M7-B3).

## Key Files

| File                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retention.ts`               | `runRetention(db, { now, retentionDays })` — deletes `usage_log` rows older than the retention window.                                                                                                                                                                                                                                                                                                                                              |
| `translation-cleanup.ts`     | `runTranslationCleanup(db, bucket, { now, dryRun? })` — deletes expired `text_translations` (Free-tier, non-null `expires_at`) and finished/failed `translation_jobs` past retention; purges corresponding R2 objects (source PDF + bilingual output).                                                                                                                                                                                              |
| `translation-retry.ts`       | `runTranslationRetry(db, queue, { now, dryRun? })` — re-enqueues `translation_jobs` that failed with retriable `error_code` values (`transient_llm`, `r2_timeout`, `output_write`) within the past 1 hour; caps at 100 retries/tick.                                                                                                                                                                                                                |
| `translation-stuck-sweep.ts` | `runTranslationStuckSweep(db, { now, dryRun? })` — marks jobs stuck in `processing` for > 30 min as `failed` with `error_code = transient_llm` so the retry job can pick them up. Used in tandem with the queue consumer's `progress_updated_at` heartbeat (M7-B1).                                                                                                                                                                                  |
| `spend-monitor.ts`           | `runSpendMonitor(db, env, { now, fetch?, dryRun? })` — sums per-bucket usage over the trailing 24h from `usage_log`, compares against env-configured thresholds (`SPEND_ALERT_*`), and posts a Slack `blocks` payload to `SLACK_WEBHOOK_URL`. Returns `{checked, alerted, breaches, skippedReason?, error?}`. Buckets covered: `ai_translate_monthly`, `web_text_translate_monthly`, `web_text_translate_token_monthly`, `web_pdf_translate_monthly`, `ai_rate_limit`. Skips silently when no thresholds are set or `SLACK_WEBHOOK_URL` is missing. |

## For AI Agents

- All jobs must be **idempotent** — safe to re-run within the same cron window without double-deleting, double-retrying, or double-alerting.
- Each job accepts a `dryRun` flag: reads but does not write/POST. Use it in tests to verify selection logic independently of side effects.
- Keep runtime bounded: D1 has a latency budget. Batch/limit row counts (retry caps at 100/tick; cleanup paginates if needed).
- `translation-retry.ts` requires the `TRANSLATION_QUEUE` binding; it returns early if `queue` is `undefined` (e.g., in test environments).
- `spend-monitor.ts` reads thresholds via property lookup on `WorkerEnv` — adding a new bucket means: (a) extend the `THRESHOLDS` array, (b) add the env var to `wrangler.toml` + `env.ts`, (c) document in `docs/ops/`. Threshold values must parse as positive finite numbers; non-numeric or `<=0` values silently disable that bucket.
- Register new jobs in `src/worker.ts` (the `scheduled` handler dispatches by cron expression); add a vitest under `scheduled/__tests__/` that exercises the job against an in-memory DB via `src/__tests__/utils/test-db.ts`.

<!-- MANUAL: -->
