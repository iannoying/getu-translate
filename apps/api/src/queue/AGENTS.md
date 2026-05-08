<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-08 | Updated: 2026-05-08 -->

# queue

## Purpose

Cloudflare Queues consumer for the document-translation pipeline. The Worker's `queue` handler in `worker.ts` delegates here per batch; each message carries a `{ jobId }` payload. The consumer claims the row in `translation_jobs`, runs the full PDF → chunked translation → bilingual output flow, and writes status + R2 outputs back atomically. Idempotent: a re-delivered message whose job is already past `queued` is skipped.

## Key Files

| File                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translate-document.ts` | `createQueueHandler({ db, bucket, env, translateChunk?, pipelineOpts? })` — exports `.queue(batch, env, ctx)`. Per-message lifecycle: load job → idempotency guard → claim (`queued` → `processing`, sets `progress_updated_at`) → fetch source PDF from R2 → `extractTextFromPdf` → `chunkParagraphs` → `runTranslationPipeline(translateChunk, …)` with retry/backoff → render bilingual HTML + Markdown via `renderHtml` / `renderMarkdown` → write outputs to R2 → mark job `succeeded`. Errors map to typed `ERROR_CODES` (`scanned_pdf`, `transient_llm`, `r2_timeout`, `output_write`, `generic`). Always acks the message — a failed job stays in DB for the scheduled retry/stuck-sweep to recover. Heartbeats `progress_updated_at` so `runTranslationStuckSweep` can distinguish "live" from "stalled" jobs (M7-B1). |

## Subdirectories

| Directory    | Purpose                                                       |
| ------------ | ------------------------------------------------------------- |
| `__tests__/` | Vitest tests for the consumer (idempotency, error mapping, heartbeat). |

## For AI Agents

### Working In This Directory

- The handler **always acks the message** — Cloudflare Queues retries are handled at the application layer (`scheduled/translation-retry.ts` re-enqueues failed jobs by `error_code`) rather than relying on queue-level redelivery. Do not reintroduce `msg.retry()` without coordinating with the scheduled retry job.
- Localized failure messages (`FAILURE_MSG_*`) are surfaced to the user via the job row's `error_message`. Keep them short, in zh-CN, and free of internal details.
- The `translateChunk` and `pipelineOpts` factory options exist for tests — production paths use the defaults (real `dispatchTranslate`, `maxRetries=3`, `baseBackoffMs=1000`).
- **Quota** is consumed via `buildPdfQuotaRequestId(userId, jobId)`; that ID dedupes against the `usage_log` so a re-delivered message doesn't double-bill.
- When adding a new failure mode: add a constant to `ERROR_CODES`, branch in the catch chain, surface a localized `FAILURE_MSG_*`, and (if the failure is retriable) include the new code in `scheduled/translation-retry.ts`'s allowlist.

### Testing Requirements

- Tests use the in-memory DB harness from `src/__tests__/utils/test-db.ts` and an in-memory R2 stub.
- Cover: success path writes outputs and transitions to `succeeded`; idempotency skip when `status !== "queued"`; claim race (no rows updated) is a no-op; each `ERROR_CODES` branch produces the right `error_code` + localized `error_message`; heartbeat updates `progress_updated_at` between stages.

## Dependencies

### Internal

- `@getu/db` — `schema.translationJobs`, `Db` type.
- `../translate/*` — PDF extract, chunker, pipeline, output writers, dispatch factory.
- `../billing/period` — `periodKey` for usage bucketing.
- `../analytics/logger` — structured logging (never bare `console.*`).

### External

- `drizzle-orm` (sqlite-core) — `eq`, `and`, `sql`.
- `@cloudflare/workers-types` — `MessageBatch`, `R2Bucket`, `ExecutionContext`.

<!-- MANUAL: -->
