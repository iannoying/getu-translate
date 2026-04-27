# Translation Cleanup Runbook

## What it does

Daily cron deletes expired translation data, retries transient failures, and
unsticks processing jobs. Three functions run in parallel via `Promise.allSettled`
inside the `scheduled` handler in `apps/api/src/worker.ts`.

## Schedule

Daily 03:00 UTC (`crons = ["0 3 * * *"]` in `apps/api/wrangler.toml`).

To add hourly retry/sweep cadence, add a second cron entry:

```toml
[triggers]
crons = ["0 3 * * *", "0 */1 * * *"]
```

Note: the `scheduled` handler runs all four tasks regardless of which cron
fires — for M6.13 consider splitting by event `scheduledTime` if different
frequencies per task are needed.

## Functions

### 1. `runTranslationCleanup`

File: `apps/api/src/scheduled/translation-cleanup.ts`

- Deletes `text_translations` rows where `expires_at IS NOT NULL AND expires_at < now`
- Finds `translation_jobs` rows where `expires_at < now`, collects R2 keys
  (`source.pdf`, `segments.json`, `output.html`, `output.md`), deletes via
  `R2Bucket.delete(keys[])` batch (chunks of 1000), then deletes the DB rows
- R2 deletion happens **before** DB deletion — partial failure leaves orphaned
  R2 objects (recoverable on next run) rather than orphaned DB rows

### 2. `runTranslationRetry`

File: `apps/api/src/scheduled/translation-retry.ts`

- Finds up to 100 `failed` jobs with:
  - `error_code IN ('transient_llm', 'r2_timeout', 'output_write')`
  - `retried_count < 3`
  - `failed_at > now - 1h`
- Resets each to `status='queued'`, increments `retried_count`, clears
  `failed_at` / `error_code` / `error_message`
- Sends `{ jobId }` to `TRANSLATE_QUEUE`

### 3. `runTranslationStuckSweep`

File: `apps/api/src/scheduled/translation-stuck-sweep.ts`

- Finds `processing` jobs with `created_at < now - 30min`
- Marks them `status='failed'`, `error_code='transient_llm'`,
  `failed_at=now`, `error_message='翻译任务超时，已自动重试'`
- After this runs, `runTranslationRetry` (same cron tick) picks them up
  automatically for re-queue

## Eligible error_codes for retry

| Code | Meaning | Retried |
|---|---|---|
| `transient_llm` | LLM provider 5xx or 429 after pipeline retries | Yes |
| `r2_timeout` | R2 source object missing (possible transient blip) | Yes |
| `output_write` | HTML/MD write to R2 failed | Yes |
| `scanned_pdf` | Scanned image PDF — cannot succeed without OCR | No |
| `generic` | Unknown failure — manual investigation needed | No |

## How to dry-run (preview without deletes)

The cleanup and retry functions accept `opts.dryRun = true`. To invoke this
in production without code deploy, temporarily set an env var and branch on it
in worker.ts — or trigger via a custom fetch endpoint protected by admin auth.

## How to manually trigger

```bash
# Tail live logs
wrangler tail --env production

# Trigger cron via Cloudflare dashboard:
# Workers & Pages → getu-api → Triggers → Cron Triggers → Run Cron
```

## Metrics to watch

Each function returns a result object logged at `[scheduled]` prefix:

| Metric | Field | Alert threshold |
|---|---|---|
| Text translations deleted | `textTranslationsDeleted` | Informational |
| Translation jobs deleted | `translationJobsDeleted` | Informational |
| R2 objects deleted | `r2ObjectsDeleted` | Informational |
| Jobs retried | `retried` | >100 sustained → upstream outage? |
| Stuck jobs swept | `stuckMarkedFailed` | >10 → investigate worker crashes |
| Errors | `errors` array | Any non-empty → investigate |

## Failure escalation

1. **`errors` array non-empty 3+ days running** → check Cloudflare cron logs,
   verify R2 bucket permissions and D1 database connectivity
2. **`retried` count > 100 per tick consistently** → possible LLM provider
   outage; consider pausing retries by returning early in `runTranslationRetry`
3. **`stuckMarkedFailed` count > 10** → investigate worker panics or D1
   write timeouts in the queue consumer (`apps/api/src/queue/translate-document.ts`)
4. **R2 objects not deleted** → verify `BUCKET_PDFS` binding is present in
   `wrangler.toml` and the worker has delete permissions on the bucket

## Migration safety notes

The M6.12 migration (`0006_modern_lenny_balinger.sql`) is purely additive:

```sql
ALTER TABLE `translation_jobs` ADD `error_code` text;
ALTER TABLE `translation_jobs` ADD `failed_at` integer;
ALTER TABLE `translation_jobs` ADD `retried_count` integer DEFAULT 0 NOT NULL;
```

Existing rows get `retried_count=0` and NULL for the timestamp/code fields.
No backfill required. Safe to apply with zero downtime.
