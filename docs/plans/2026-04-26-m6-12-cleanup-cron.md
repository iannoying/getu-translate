# M6.12 — Scheduled Cleanup Worker + R2 Lifecycle + Auto-Retry (Outline)

> **For agentic workers:** OUTLINE plan. Expand into full TDD plan after M6.11 has merged. **THIS PR REQUIRES HUMAN REVIEW** (touches production data deletion + R2 lifecycle).

**Goal:** Daily-cron Worker that deletes expired text translations + PDF jobs (D1 rows + R2 objects), retries failed jobs that crashed within the last hour, and configures R2 lifecycle for source.pdf archival.

**Issue:** [#179 (M6.12/13)](https://github.com/iannoying/getu-translate/issues/179)

---

## File structure (PR scope)

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/scheduled/translation-cleanup.ts` | Create | The cleanup function (D1 + R2) |
| `apps/api/src/scheduled/__tests__/translation-cleanup.test.ts` | Create | Unit tests with mocked R2/DB |
| `apps/api/src/scheduled/translation-retry.ts` | Create | Re-enqueues recently-failed jobs (max 3 retries lifetime) |
| `apps/api/src/scheduled/__tests__/translation-retry.test.ts` | Create | Unit tests |
| `apps/api/src/worker.ts` | Modify | Wire both cleanups into the existing `scheduled` handler |
| `apps/api/wrangler.toml` | Modify | Verify `crons` covers our cadence (existing `0 3 * * *` already daily) |
| `packages/db/src/schema/translate.ts` | Modify | Add `retried_count` column to `translation_jobs` |
| `packages/db/drizzle/<NNNN>_<name>.sql` | Create | Migration for `retried_count` column |
| `docs/ops/runbook-translation-cleanup.md` | Create | Internal runbook for ops |

---

## Acceptance Criteria (from issue body)

- [ ] `translation_jobs` rows where `expires_at < now` are deleted; corresponding R2 objects (source.pdf, segments.json, output.html, output.md) are deleted.
- [ ] `text_translations` rows where `user_id IN (free) AND created_at < now - 30d` are deleted (free retention).
- [ ] Pro `text_translations` rows are kept indefinitely (the M6.6 schema already permits null `expires_at`; cleanup respects that).
- [ ] Failed jobs created within the last 1 hour with `retried_count < 3` are re-enqueued (status reset to 'queued', retried_count++).
- [ ] Cleanup is idempotent — running twice in a row produces no errors.
- [ ] Cleanup metrics logged: deleted_text_count, deleted_job_count, deleted_r2_count, retry_count.
- [ ] R2 lifecycle rules for `pdfs/*/source.pdf` archive at 90 days (configured manually in CF dashboard — verify present and document in runbook).

---

## Cross-cutting decisions (settle here)

### How to know which user is on which plan during cleanup

The cleanup runs **without an authenticated user context**. We need to JOIN against `userEntitlements` to determine plan tier. For free users on `text_translations` (which has `expires_at` nullable for Pro), we use `expires_at IS NOT NULL AND expires_at < now`. The plan-tier check happens at write time (M6.6), not at cleanup time.

This means cleanup can be a simple `expires_at < now` filter — no plan join needed.

### R2 list-and-delete cost

Every job has up to 4 R2 objects (source, segments, html, md). For 1k expired jobs that's 4k DELETEs.
- R2 Class B operations (DELETE) are billed but cheap (~$0.004 / 1k).
- We delete via `R2Bucket.delete([keys])` (batch) — one Class B per key, but no GET needed.

### Retry mechanics

- Add column `retried_count INTEGER NOT NULL DEFAULT 0` to `translation_jobs`.
- M6.9's consumer increments `retried_count` on terminal failure ONLY if the failure is "transient" (LLM 5xx after retries, R2 timeout). Hard failures (scanned PDF, R2 missing source) do NOT increment — those will never succeed on retry.
- M6.12's retry worker selects: `status='failed' AND retried_count < 3 AND failed_at > now - 1h AND error_code IN ('TRANSIENT_LLM', 'R2_TIMEOUT')`.

This requires:
- New column `retried_count`
- New column `failed_at` (timestamp_ms; set when status transitions to failed)
- New column `error_code` (enum-like text; the canonical zh-CN message stays in `error_message`)

These are additive columns; migration is safe.

---

## High-Level Tasks

1. **Schema migration** — add 3 new columns. Safe additive change. Test that existing rows have null values that don't break queries.
2. **Update M6.9 consumer** — set `failed_at` and `error_code` when transitioning to 'failed'.
3. **Implement `translation-cleanup.ts`** — D1 deletes + R2 batch delete. Defensive: list R2 objects under `pdfs/{userId}/{jobId}/` and delete all (don't trust D1 column values to enumerate — extra robustness).
4. **Implement `translation-retry.ts`** — UPDATE status='queued', retried_count+=1; re-enqueue to TRANSLATE_QUEUE.
5. **Wire into `worker.ts`** — extend the existing `scheduled` handler.
6. **Runbook** — `docs/ops/runbook-translation-cleanup.md` covers: how to manually trigger, how to skip cleanup if maintenance is in progress, how to inspect deleted counts.

---

## Risk register (CRITICAL — these are why this PR needs human review)

| Risk | Mitigation |
|---|---|
| Bug in cleanup deletes non-expired data | Run cleanup in dry-run mode first (`env.CLEANUP_DRY_RUN=true`) — log what would be deleted, don't delete. Promote to live after one cycle. |
| R2 lifecycle misconfigured by hand | Document exact rules in runbook. Verify via `wrangler r2 bucket lifecycle list getu-pdfs`. |
| Retry storm if many jobs fail at once | Cap retry count to N=100 jobs per cron tick. Excess defer to next tick. |
| Race between user creating new job and cleanup deleting their job | Cleanup uses `expires_at < now`. New jobs have future `expires_at`. No race window. |

---

## Pre-conditions for expansion

- [ ] M6.11 merged; preview/history pages exist so users can SEE deletion happening over time
- [ ] User confirms whether dry-run-first cycle is acceptable (one extra day before deletes go live)
- [ ] User has manually applied R2 lifecycle rules in CF dashboard (or coordinates with executor to do it via `wrangler`)

Run `/writing-plans` after these are confirmed.
