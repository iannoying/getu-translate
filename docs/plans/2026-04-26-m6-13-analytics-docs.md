# M6.13 — Analytics + Observability + User Docs (Outline)

> **For agentic workers:** OUTLINE plan. **THIS PR REQUIRES HUMAN REVIEW** (touches external analytics keys, public docs, ops runbooks). Expand into full TDD plan after M6.12 has merged AND the user has answered the open decision points below.

**Goal:** The "polish" milestone — wire real analytics events end-to-end, surface key metrics on a Workers Analytics dashboard, ship public help docs (zh + en) for `/translate` and `/document`, and finalize internal ops runbooks.

**Issue:** [#180 (M6.13/13)](https://github.com/iannoying/getu-translate/issues/180)

---

## Open decision points (cannot start without these)

| # | Question | Default if user doesn't pick |
|---|---|---|
| D1 | Analytics backend? PostHog Cloud? Plausible? Self-hosted? | **PostHog Cloud** (most flexible for funnel analysis) |
| D2 | Sentry/observability tool for runtime errors? | **Skip Sentry** — use Workers' built-in `console.error` + Workers Analytics Engine (free, integrated). Adopt Sentry only if signal/noise becomes painful. |
| D3 | Help docs in MDX or plain Next.js page? | **MDX** — easier to maintain prose + screenshots |
| D4 | Should the help docs be /docs/ subpath or /guide/? | **/guide/** (issue body uses this) |
| D5 | Truly public docs (no login) or behind login? | **Public** (SEO + onboarding value) |

**The executing agent must NOT proceed past Step 0 until the user has confirmed each of D1–D5.**

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
