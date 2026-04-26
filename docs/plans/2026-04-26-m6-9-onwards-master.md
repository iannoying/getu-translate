# M6.9 Onwards — Master Coordination Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute the per-PR plans referenced below. This master plan is **strategy only** — do NOT execute it directly. Open the per-PR plan, then invoke the executing skill on that file.

**Goal:** Land the remaining M6 milestones (M6.9~M6.13) plus a bundled cleanup of M6.5b/M6.7 follow-ups, shipping the web `/document` PDF translation pipeline end-to-end.

**Architecture:** Six sequential PRs, each landing on `main` after CI + subagent review. The dependency chain is strict (`#198/#204 follow-ups → M6.9 → M6.10 → M6.11 → M6.12 → M6.13`); no parallelism is possible at the PR level.

**Tech Stack:** Cloudflare Workers · D1 (SQLite via drizzle) · R2 · Cloudflare Queues · Cron Triggers · `unpdf` (M6.9 introduces) · oRPC · Hono · Next.js 15 (static export) · vitest 4 · @dnd-kit · Jotai.

---

## 0. Authoritative References

- Design: [`docs/plans/2026-04-25-web-translate-document-design.md`](2026-04-25-web-translate-document-design.md)
- Open issues: #176 (M6.9), #177 (M6.10), #178 (M6.11), #179 (M6.12), #180 (M6.13), #198 (M6.5b follow-ups), #204 (M6.7 follow-ups)
- Schema: [`packages/db/src/schema/translate.ts`](../../packages/db/src/schema/translate.ts)
- Existing worker entry: [`apps/api/src/worker.ts`](../../apps/api/src/worker.ts)
- Existing scheduled pattern: [`apps/api/src/scheduled/retention.ts`](../../apps/api/src/scheduled/retention.ts)
- Document orpc procedures: [`apps/api/src/orpc/translate/document.ts`](../../apps/api/src/orpc/translate/document.ts)
- Web `/document` client: [`apps/web/app/[locale]/document/document-client.tsx`](../../apps/web/app/[locale]/document/document-client.tsx)

---

## 1. Execution Order & Auto-Merge Policy

| # | Plan file | Issue | Auto-merge | Reviewer model |
|---|-----------|-------|------------|----------------|
| 1 | `2026-04-26-m6-followups-bundle.md` | #198 + #204 (HIGH only) | ✅ on green CI + reviewer pass | opus + codex |
| 2 | `2026-04-26-m6-9-queue-consumer.md` | #176 | ✅ on green CI + reviewer pass | opus + codex |
| 3 | `2026-04-26-m6-10-bilingual-writer.md` | #177 | ✅ on green CI + reviewer pass | opus + codex |
| 4 | `2026-04-26-m6-11-preview-history.md` | #178 | ✅ on green CI + reviewer pass | opus + codex |
| 5 | `2026-04-26-m6-12-cleanup-cron.md` | #179 | ❌ **human review required** (cron + R2 lifecycle + delete production data) | opus + codex |
| 6 | `2026-04-26-m6-13-analytics-docs.md` | #180 | ❌ **human review required** (external analytics keys, Sentry DSN, public docs) | opus + codex |

### Subagent dispatch rules

- **Development**: `executor` agent, `model=sonnet` (per user directive).
- **Code review pass 1**: `code-reviewer` agent, `model=opus`.
- **Code review pass 2 (adversarial)**: `/codex:adversarial-review`. **5-minute soft timeout**: if codex hasn't returned by then, log the timeout in the PR description and proceed without its findings. Do NOT block on codex.
- **Verification**: `verifier` agent, `model=sonnet`, post-merge for M6.9~M6.11; `model=opus` for M6.12~M6.13.

### Auto-merge mechanics

After CI green + reviewer pass, the executing skill calls `gh pr merge --auto --squash` on auto-merge PRs. For human-review PRs (M6.12, M6.13), the executing skill stops at `Ready for human review` with a one-line summary and link, and waits.

---

## 2. Cross-PR Decisions (locked here; do not re-debate per PR)

### 2.1 Module ownership

- **Queue consumer** lives at `apps/api/src/queue/translate-document.ts`. Re-exported from `apps/api/src/worker.ts` via the new `queue` handler.
- **PDF parsing** isolated in `apps/api/src/translate/pdf-extract.ts` so M6.9's chunking code stays unit-testable without unpdf in the test path.
- **Output rendering** isolated in `apps/api/src/translate/document-output.ts` (M6.10).
- **Cleanup logic** lives at `apps/api/src/scheduled/translation-cleanup.ts` (M6.12) — separate from `retention.ts` to keep concerns split.
- **Analytics emit** lives at `apps/api/src/analytics/events.ts` (M6.13) — server side; web client emits via a new `orpc.analytics.track` procedure.

### 2.2 Naming conventions (locked)

- R2 keys use the pattern already established by M6.8: `pdfs/{userId}/{jobId}/source.pdf`, plus M6.10 will add `pdfs/{userId}/{jobId}/output.html`, `pdfs/{userId}/{jobId}/output.md`, and `pdfs/{userId}/{jobId}/segments.json` (intermediate, kept for debugging until cleanup).
- Queue message shape: `{ jobId: string }` (M6.8 already enqueues this). M6.9 must NOT widen the schema without a migration plan.
- Progress JSON shape (`translation_jobs.progress`): `{ stage: "extracting" | "translating" | "rendering"; pct: number; chunk?: number; chunkTotal?: number }`. M6.9 writes; M6.11 reads.

### 2.3 Concurrency & limits

- LLM call concurrency inside one job: **5** (per design doc). Configurable via `env.PDF_LLM_CONCURRENCY` for ops escape hatch.
- Per-chunk retry: **3** with exponential backoff (1s → 2s → 4s).
- Whole-job timeout: **5 minutes** of CPU work + queue wall-clock (Workers Queues default visibility timeout). M6.9 must set the queue's `max_retries=2` and `max_batch_timeout=300` in `wrangler.toml`.

### 2.4 Failure modes (canonical error messages, in zh-CN since the UI is zh-default)

| Failure | `error_message` |
|---|---|
| Scanned PDF (no text extracted) | `检测到扫描件 PDF，标准翻译暂不支持，敬请期待 v2 OCR 版本` |
| LLM provider 5xx after retries | `翻译模型暂时不可用，请稍后重试` |
| LLM 429 after retries | `当前翻译压力较大，请稍后重试` |
| Output write failure | `结果保存失败，请重试或联系客服` |
| Generic | `翻译失败，请重试` |

### 2.5 Quota refund policy

- M6.8 consumes quota at job-create time (atomic with INSERT).
- **M6.9 must refund the page count to `quotaPeriod` on terminal failure** (status='failed'), via a compensating row in `usageLog` with negative `amount` and request_id `refund:{jobId}`. Idempotent on the (userId, requestId) UNIQUE.

### 2.6 Out-of-scope (deferred to M7+)

- BabelDOC layout-preserving rendering (engine='babeldoc')
- OCR pipeline for scanned PDFs
- Concurrent PDF jobs per user (locked at 1 by partial unique index)
- Server-side translate caching across jobs

---

## 3. Per-PR plan status

| PR plan | Detail level at time of writing | Why |
|---|---|---|
| follow-ups bundle | **Full TDD detail** | All inputs are merged code; no unknowns. Ready to execute. |
| M6.9 | **Full TDD detail** | All inputs (M6.8 queue producer, schema, R2) are merged. |
| M6.10 | **Outline + concrete file structure** | Depends on M6.9's segment data shape. Full TDD steps written after M6.9 merge. |
| M6.11 | **Outline + concrete file structure** | Depends on M6.10's HTML/MD output. Full TDD steps written after M6.10 merge. |
| M6.12 | **Outline + concrete file structure** | Depends on retention semantics being fixed by M6.10/M6.11 usage. |
| M6.13 | **Outline + open decision points** | Depends on which analytics backend gets chosen (decision point flagged for human). |

The executing skill **must refuse** to start an outline-level plan and instead invoke `superpowers:writing-plans` to expand it first.

---

## 4. Pre-flight — environment readiness

Before starting **any** PR, the executor agent must verify (and the master plan owner — you, Claude — must reconfirm with the user when needed):

- [ ] `pnpm install --frozen-lockfile` succeeds at repo root
- [ ] `pnpm -r build` is green on `main`
- [ ] `pnpm -r test` is green on `main`
- [ ] `pnpm -r type-check` is green on `main`
- [ ] `gh auth status` returns logged in
- [ ] User confirms whether the Cloudflare Queue `getu-translate-jobs` exists (it should, since M6.8 enqueues to it). If not, ask user to run `wrangler queues create getu-translate-jobs` before starting M6.9.

---

## 5. Commit / PR conventions

- Commit style: `feat(api): <chinese-or-english summary> (M6.X)` / `fix(...)` / `chore(...)` — match conventional-commits + repo history.
- One PR per master-plan row. Multiple commits inside one PR are fine; squash-merge.
- PR title: `feat(api): <summary> (M6.X) (#<issue>)`.
- PR body must include:
  - link to issue (Closes #N)
  - link to plan file
  - test plan checklist
  - reviewer summary (filled by code-reviewer subagent before auto-merge)
  - codex review summary OR `[codex review skipped after 5min timeout]`
- Do NOT include `Co-Authored-By` (repo settings disable attribution).

---

## 6. Halting conditions

The executing skill **must stop and surface to the user** if any of these happen:

1. CI fails on `main` after a merge (don't start the next PR until main is green).
2. Three consecutive subagent attempts on the same task fail (per CLAUDE.md "after 3 attempts, stop").
3. Reviewer agent flags a CRITICAL finding.
4. Codex returns within 5 min with a CRITICAL finding (treat same as in-house critical).
5. A new dependency is needed beyond `unpdf` (M6.9) — must ask user.
6. M6.12 or M6.13 reach `Ready for human review` — wait, do not auto-merge.
