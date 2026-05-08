<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-05-08 -->

# scripts

## Purpose

Standalone Node scripts run via `tsx`. Two flavors live here: (1) one-off maintenance scripts that touch the production DB, and (2) post-deploy smoke tests invoked from CI to gate the auto-rollback path (M7-A3). Neither is bundled into the Worker.

## Key Files

| File            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grant-pro.ts`  | Manually grants a user a Pro entitlement. Run via `pnpm --filter @getu/api grant-pro <userId>`.                                                                                                                                                                                                                                                                                                                                            |
| `smoke-prod.ts` | Post-deploy HTTP smoke test against `API_BASE_URL` (defaults to `https://api.getutranslate.com`). Hits `GET /health`, `POST /orpc/billing/getEntitlements`, `POST /orpc/translate/document/list`, `POST /orpc/translate/text/listHistory`. Anonymous oRPC calls must respond `401`/`403` (handler reached + auth check fired); any `5xx` indicates a missing schema/binding and fails the run. Exit `1` on any failure. Honors a closed-by-default `SMOKE_FORCE_FAIL=true` env switch (used to exercise the rollback path via the `force_smoke_fail` workflow_dispatch input). Invoked from `.github/workflows/deploy-api.yml`. |

## For AI Agents

- Maintenance scripts may read/write prod data — confirm destination before running and require an explicit flag/argument for any destructive action.
- `smoke-prod.ts` is the **load-bearing rollback signal** for prod API deploys. Keep new checks anonymous-safe (they should hit auth/contract paths without needing a session) and avoid calls that exceed a few seconds — CI runs this synchronously after `wrangler deploy`.
- When adding a new oRPC route, consider extending `smoke-prod.ts` so a missing migration / KV binding is caught at deploy time, not in user traffic.
- Prefer adding a new script file over editing existing ones when the semantics differ; keep each script's CLI contract documented in its header comment.

<!-- MANUAL: -->
