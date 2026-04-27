# M6.13 — Analytics + Observability + User Docs (Outline)

> **For agentic workers:** OUTLINE plan. **THIS PR REQUIRES HUMAN REVIEW** (touches external analytics keys, public docs, ops runbooks). Expand into full TDD plan after M6.12 has merged AND the user has answered the open decision points below.

**Goal:** The "polish" milestone — wire real analytics events end-to-end, surface key metrics on a Workers Analytics dashboard, ship public help docs (zh + en) for `/translate` and `/document`, and finalize internal ops runbooks.

**Issue:** [#180 (M6.13/13)](https://github.com/iannoying/getu-translate/issues/180)

---

## Open decision points (cannot start without these)

| # | Question | User decision (confirmed 2026-04-27) |
|---|---|---|
| D1 | Analytics backend? PostHog Cloud? Plausible? Self-hosted? | **PostHog Cloud** — `@sentry/cloudflare`-style SDK; free tier 1M events/month |
| D2 | Sentry/observability tool for runtime errors? | **Sentry Cloud** — official `@sentry/cloudflare` SDK; new `SENTRY_DSN` secret; `withSentry()` wraps default export; sourcemap upload via wrangler deploy; free Developer plan 5K errors/month |
| D3 | Help docs in MDX or plain Next.js page? | **MDX** — `@next/mdx` + remark-gfm |
| D4 | Should the help docs be /docs/ subpath or /guide/? | **/guide/** (issue body convention) |
| D5 | Truly public docs (no login) or behind login? | **Mixed (public-with-auth-gated-details)** — page shells + intro + screenshots are SEO-public; specific quota numbers + paid model details inside an `<AuthGate>` component visible only after login. Better SEO than full-private; better anti-scraping than fully-public. |

All 5 decisions are locked. Implementation can proceed.

---

## Track B: Deployment Hardening (added 2026-04-27 after M6.12 deploy)

While preparing the M6.12 deploy, discovered that **prod D1 was missing migrations 0004/0005/0006 and the R2 bucket + Queue had never been created** despite M6.6~M6.11 already being merged to main. M6.x prod was effectively broken-but-not-detected for ~48h. This sub-track addresses the underlying gaps.

### B1 — CI deploy gate for D1 migrations

**Goal:** Prevent any future deploy from going out without the matching migrations applied.

**Files:**
- `.github/workflows/deploy-api.yml` (or wherever the api deploy lives) — add `wrangler d1 migrations apply DB --remote` step BEFORE `wrangler deploy`
- If no deploy workflow exists yet, create one with the gate already wired

**Constraints:**
- The migrate step must succeed before the deploy step runs
- Must use the production env binding: pass `--env production` if the workflow targets that env
- Wrangler API token used by CI needs `D1: Edit` permission

### B2 — Deployment dependency checklist

**Goal:** Every prod resource (bucket / queue / secret / KV / cron) is enumerated in one place so a new operator knows what must exist before deploy.

**Files:**
- Create: `apps/api/DEPLOY-CHECKLIST.md` — single source of truth; lists:
  - D1 database id + binding name + how migrations are applied
  - R2 bucket(s) name + purpose + how to recreate
  - Queue(s) name + producer/consumer mapping
  - Required secrets (names only, not values; with `wrangler secret put` commands)
  - Cron triggers
  - R2 lifecycle rules expected
  - First-time-on-this-account bring-up procedure (the exact sequence we just ran today)

### B3 — R2 token rotation procedure

**Goal:** Document how to rotate the R2 API token without downtime.

**Files:**
- `docs/ops/runbook-r2-token-rotation.md` — covers:
  - When to rotate (annual schedule, suspected leak, employee offboarding)
  - The rotation procedure (create new token → `wrangler secret put` overwrite → verify old token still works → revoke old token after grace period)
  - Validation steps (upload a test PDF, check logs)

### B4 — Post-deploy smoke test

**Goal:** Detect "schema not migrated" / "bucket missing" / "queue missing" failures within minutes, not days.

**Files:**
- `apps/api/scripts/smoke-prod.ts` — a `tsx` script that:
  - Calls `documentList` (touches translation_jobs SELECT)
  - Calls `documentDownloadUrl` with a known done-job (touches R2 GET signing)
  - Posts a synthetic message to `getu-translate-jobs` queue (touches producer)
  - Reports pass/fail per check
- Optionally wire into CI deploy as a post-deploy gate (block release if any fails)

### B5 — Lessons-learned doc (one-time)

**Goal:** Record what happened so the same failure mode is recognized faster next time.

**Files:**
- `docs/ops/postmortem-2026-04-m6-prod-gap.md` — covers:
  - Root cause: M6.2~M6.11 PRs merged without applying schema migrations to prod
  - Detection: caught by chance during M6.12 deploy verification (D1 migrations list showed 0004+0005+0006 pending, then table list confirmed missing tables, then R2 bucket also confirmed missing)
  - Impact: any prod request to `text_translations` or `translation_jobs` would 500; presigned PUT/GET would 500 (missing bucket); document queue would silently 500 (missing queue)
  - Why undetected: presumably no real prod traffic hit those paths during the 48h window (pre-launch)
  - Mitigation: B1 (CI gate) + B2 (checklist) + B4 (smoke test)
  - Action items: B1–B4 above

---

## File structure (PR scope)

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/analytics/events.ts` | Create | Server-side analytics emit; one function per event type |
| `apps/api/src/analytics/__tests__/events.test.ts` | Create | Unit tests with mocked PostHog client |
| `apps/api/src/orpc/analytics.ts` | Create | `track` orpc procedure (client → server) |
| `apps/api/src/orpc/__tests__/analytics.test.ts` | Create | Tests |
| `apps/api/src/orpc/index.ts` | Modify | Register analytics router |
| `apps/web/lib/analytics.ts` | Create | Client-side wrapper (calls orpc.analytics.track) |
| `apps/web/app/[locale]/translate/translate-client.tsx` | Modify | Replace stub `console.info` with real `analytics.track(...)` |
| `apps/web/app/[locale]/document/document-client.tsx` | Modify | Add `pdf_uploaded`, `pdf_completed`, `pro_upgrade_triggered` |
| `apps/web/app/[locale]/guide/translate/page.mdx` | Create | User-facing /translate help page (zh) |
| `apps/web/app/[locale]/guide/document/page.mdx` | Create | User-facing /document help page (zh) |
| `apps/web/app/en/guide/translate/page.mdx` | Create | EN translation |
| `apps/web/app/en/guide/document/page.mdx` | Create | EN translation |
| `docs/ops/runbook-translation-incidents.md` | Create | "Queue lag", "model id drift", "quota anomaly", "cost alert thresholds" |
| `docs/ops/runbook-translation-cleanup.md` | Modify (M6.12 created it) | Cross-link from incident runbook |
| `apps/web/app/[locale]/translate/__tests__/translate-orchestrator.test.ts` | Modify (M6.5b created it) | Replace TODO with real assertion that `analytics.track` is called for each `UpgradeModalSource` variant |

Plus deferred LOW items from #198 + #204:
| Original issue | Item | Where it lands here |
|---|---|---|
| #198 #6 | Replace `console.warn` with structured logger | new `apps/api/src/analytics/logger.ts` |
| #204 #3 | E2E for upgrade modal | `apps/web/e2e/upgrade-modal.spec.ts` (NEW Playwright config required) |
| #204 #4 | QuotaBadge danger pulse | `apps/web/app/[locale]/translate/components/QuotaBadge.tsx` CSS keyframe |

---

## Acceptance Criteria (from issue body + carryovers)

### Events fired
- [ ] `text_translate_completed { type: "text", model_id, char_count, duration_ms }` — fires from `translate-client.tsx` after `Promise.allSettled` resolves
- [ ] `pdf_uploaded { pages, size_mb, model_id }` — fires from `document-client.tsx` immediately after `documentCreate`
- [ ] `pdf_completed { jobId, duration_ms }` — fires from `preview-client.tsx` (M6.11) when status transitions to 'done'
- [ ] `pro_upgrade_triggered { source }` — already wired stub in M6.7; replace with real `analytics.track`
- [ ] All events include user-id (when authenticated) and anonymous-id (when not), tier (free/pro), session-id

### Dashboard
- [ ] Workers Analytics Engine ingests at least: translate latency p50/p95, translate failure rate by provider, queue lag (time queued → processing started), monthly DAU split free/pro
- [ ] One markdown-checked-in dashboard JSON per metric (so we can recreate it after CF UI changes)

### User-facing docs
- [ ] `/zh/guide/translate` and `/zh/guide/document` accessible without login, render correctly via `output: "export"`
- [ ] EN counterparts accessible at `/en/...`
- [ ] Each doc has: feature overview, screenshots (placeholders fine), limits & quotas table, FAQ, "what counts as 1 unit" explainer
- [ ] Linked from /translate and /document pages (a Help icon in the shell)

### Internal ops
- [ ] `runbook-translation-incidents.md` covers all 4 scenarios listed in the issue
- [ ] `runbook-translation-cleanup.md` cross-links and is up-to-date with M6.12

---

## Cross-cutting decisions (settle here)

### Analytics flow
```
Browser → orpc.analytics.track({ event, props })
  ↓
apps/api/src/orpc/analytics.ts (validates schema, attaches user-id)
  ↓
apps/api/src/analytics/events.ts (forwards to PostHog via fetch + waitUntil)
  ↓
PostHog Cloud
```

### Why server-side analytics (not direct from browser)
- Adblockers don't trip on our domain
- We can attach the authenticated user-id without exposing the PostHog API key client-side
- We can rate-limit per user

### Server-side error logging
- Drop a thin `logger` module: `logger.warn(event, props)` writes to `console.warn` AND to PostHog (with an `internal_log` event type) — searchable in PostHog without Sentry.
- Update `apps/api/src/orpc/translate/text.ts` (PROVIDER_FAILED logging) to use `logger.warn`.

---

## Pre-conditions for expansion

- [ ] D1–D5 above answered by user
- [ ] PostHog project created; PROJECT_API_KEY recorded as a wrangler secret
- [ ] Decision on whether to add Playwright (#204 #3) — if yes, user approves the new dev dependency

Once decisions are locked and pre-conditions met, run `/writing-plans` to expand. **Do not write the M6.13 detailed plan until M6.12 has merged** — the data shape from M6.12's `failed_at` / `error_code` columns informs the dashboard metrics.

---

## Closing the milestone

After M6.13 merges:
- [ ] Close issue #180 (M6.13/13)
- [ ] Close issue #198 (all items addressed: #1–5 in follow-ups bundle, #6 + #7 here)
- [ ] Close issue #204 (all items addressed: #2 in follow-ups bundle, #1 + #3 + #4 here)
- [ ] Update `docs/plans/2026-04-25-web-translate-document-design.md` status to "Shipped".
- [ ] Author release announcement (separate non-engineering task).
