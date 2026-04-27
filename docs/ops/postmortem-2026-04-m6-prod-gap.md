# Postmortem: M6.x Prod Resource Gap (2026-04-25 → 2026-04-27)

## Summary

For ~48 hours, production was missing 3 D1 migrations, 1 R2 bucket, and 1 Queue, while M6.6~M6.11 features had been merged to main and (presumably) deployed. Caught during M6.12 deploy verification.

## Timeline (UTC)

- 2026-04-25 ~15:00 — M6.2 PR #184 merges (creates `text_translations`, `translation_jobs`, `pricing_plans` tables)
- 2026-04-26 ~12:00 — M6.8 PR #205 merges (uses R2 bucket `getu-pdfs` + Queue `getu-translate-jobs`)
- 2026-04-26 ~13:30 — M6.9~M6.11 PRs merge in rapid succession
- 2026-04-27 ~02:11 UTC — M6.12 deploy prep: ran `wrangler d1 migrations list DB --remote` → discovered 0004+0005+0006 pending
- 2026-04-27 ~02:14 UTC — applied missing D1 migrations to prod
- 2026-04-27 ~02:30 UTC — discovered R2 bucket `getu-pdfs` not in dashboard → created via CLI
- 2026-04-27 ~02:35 UTC — discovered Queue `getu-translate-jobs` not present → created via CLI
- 2026-04-27 ~03:00 UTC — discovered R2 secrets (4 of them) not set in worker → user configured via wrangler secret put

## Impact

- Any prod request to `text_translations` or `translation_jobs` would 500 (missing tables).
- M6.8 PDF upload presigned PUT would 500 (missing R2 secrets).
- M6.9 queue consumer never deployed because the queue didn't exist (new bindings would have caused deploy failure).
- M6.11 download presigned GET would 500 (missing R2 secrets).

## Why undetected

Presumably no real production traffic reached these paths during the 48h window (pre-launch product). If there had been even one user-driven request to /translate or /document, it would have surfaced immediately as a 500.

## Root cause

The M6.x development workflow assumed `wrangler d1 migrations apply --remote` and the various `wrangler r2 bucket create` / `wrangler queues create` commands would be run "out-of-band" by the deploying engineer. Several PRs noted "Created out-of-band: ..." in their description but the steps were never actually executed against the production CF account.

There was no CI gate or pre-deploy checklist to enforce these.

## Recovery

1. Applied 0004+0005+0006 to prod D1 — schema now matches code (3 new tables + index + 3 columns).
2. Created `getu-pdfs` R2 bucket.
3. Created `getu-translate-jobs` queue.
4. User configured 4 R2 secrets via `wrangler secret put`.
5. Verified state: 13 tables, 7 migrations applied, R2 bucket exists, queue exists, secrets list contains R2_*.

## Action items (M6.13 Track B)

- **B1**: CI gate — workflow runs `wrangler d1 migrations apply DB --remote` before `wrangler deploy`. PR adds `.github/workflows/deploy-api.yml` with this step.
- **B2**: `apps/api/DEPLOY-CHECKLIST.md` — single source of truth for all prod resource dependencies + first-time bring-up procedure.
- **B3**: `docs/ops/runbook-r2-token-rotation.md` — formal R2 secret rotation procedure.
- **B4**: `apps/api/scripts/smoke-prod.ts` — post-deploy smoke test that hits R2 + D1 + Queue paths and reports pass/fail.
- **B5**: This postmortem document.

## Lessons

1. **Resource creation belongs in version-controlled workflow, not "out-of-band"**. The phrase "Created out-of-band" in PR descriptions is a red flag; treat as an action item, not a fait accompli.
2. **CI green ≠ prod ready**. Tests pass against in-memory SQLite + mocks. Prod schema parity must be verified separately.
3. **A new account / new env triggers all of these gaps at once**. Maintain a checklist that doubles as the bring-up procedure.
