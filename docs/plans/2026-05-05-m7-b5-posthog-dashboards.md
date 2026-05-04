# M7-B5 PostHog Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PostHog operational dashboard reproducible and auditable by documenting the five required insights, event/property dependencies, dashboard URL capture, and first weekly check procedure.

**Architecture:** This is an ops-only issue. Repository work creates a dashboard runbook and links it from the translation incidents runbook. The actual PostHog dashboard must be created in PostHog Cloud with workspace credentials unavailable in this Codex environment; this PR must not claim the dashboard exists unless a real PostHog URL and first weekly check result are supplied.

**Tech Stack:** PostHog Cloud dashboards/insights, existing GetU analytics events (`text_translate_completed`, `pdf_uploaded`, `pdf_completed`, `pro_upgrade_triggered`, `internal_log`), Markdown runbooks.

---

## Scope And Files

- Create `docs/ops/runbook-posthog-dashboard.md`: reproducible dashboard specification with five insights, suggested filters/breakdowns, missing-event notes, dashboard URL placeholder, and weekly check table.
- Modify `docs/ops/runbook-translation-incidents.md`: link to the dashboard runbook from the PostHog event integrity section.
- No application code changes.

## Important Constraint

This plan cannot complete the external acceptance criterion by itself:

- Required external action: create the PostHog dashboard and insights in PostHog Cloud.
- Required external verification: first weekly check shows usable data.
- Required repo update after external action: paste the actual dashboard URL and weekly check result into `docs/ops/runbook-posthog-dashboard.md`.

If no PostHog credentials are available, the PR should use `Refs #230`, not `Closes #230`.

## Task 1: Add PostHog Dashboard Runbook

**Files:**
- Create: `docs/ops/runbook-posthog-dashboard.md`
- Modify: `docs/ops/runbook-translation-incidents.md`

- [ ] **Step 1: Create dashboard runbook**

Create `docs/ops/runbook-posthog-dashboard.md`:

```md
# PostHog Operations Dashboard Runbook

Status: **pending external PostHog dashboard configuration**.

This runbook defines the standing PostHog dashboard required by M7-B5. It is intentionally reproducible because the dashboard itself lives in PostHog Cloud and cannot be reviewed in git.

## Dashboard

| Field | Value |
|---|---|
| Dashboard name | `GetU Ops - Launch Health` |
| PostHog dashboard URL | Pending |
| Owner | Pending |
| Created at | Pending |
| First weekly check | Pending |

Do not mark issue #230 complete until the dashboard URL is filled and the first weekly check table has a real observation.

## Event Inventory

| Event | Emitted by | Key properties | Notes |
|---|---|---|---|
| `text_translate_completed` | Web `/translate` client via API analytics route | `modelId`, `charCount`, `durationMs` | Used for translate activity and average translation time. |
| `pdf_uploaded` | Web `/document` client via API analytics route | `sizeMb`, `modelId` | Used as PDF funnel start. The from-URL path sets `sizeMb: 0` because the client does not know the remote file size. |
| `pdf_completed` | Web document preview client via API analytics route | `jobId`, `durationMs` | Used for PDF success rate and duration. |
| `pro_upgrade_triggered` | Web translate/document upgrade prompts via API analytics route | `source` or plan/provider fields depending call site | Used as upgrade-intent signal. |
| `internal_log` | API logger PostHog fan-out | `level`, `message`, plus caller props such as `provider` and `statusCode` | B2 makes info/warn console-only by default; error forwards by default. No stable `errorCode` property is emitted yet. |

Current instrumentation limitations:

- There is no dedicated `checkout_started` event in the analytics contract. Until that is added, the translate funnel uses `pro_upgrade_triggered` as the final measurable step and labels checkout-started as pending instrumentation.
- Analytics currently requires an authenticated API session; anonymous browser calls are suppressed after `UNAUTHORIZED`.
- The API analytics route forwards only the event properties supplied by the caller. It does not currently attach tier/person properties.
- `internal_log` only contains caller-supplied props. Provider failures currently include `provider`, `statusCode`, and `message`; PDF job `errorCode` values are stored in D1 but are not emitted to PostHog yet.

## Required Insights

### 1. DAU split by free/pro

- Type: Trends
- Event: any of `text_translate_completed`, `pdf_uploaded`, `pdf_completed`, `pro_upgrade_triggered`
- Aggregation: unique users by day
- Breakdown: `tier`
- Instrumentation prerequisite: **missing**. Add a tier property to analytics events or sync a PostHog person property from entitlements before this chart is considered usable.
- Display: stacked bar, last 14 days
- Status: Pending instrumentation + dashboard creation

### 2. Translate funnel

- Type: Funnel
- Steps:
  1. `text_translate_completed`
  2. `pro_upgrade_triggered`
  3. `checkout_started` — pending instrumentation
- Display: conversion rate, last 14 days
- Note: The original roadmap says `visit -> translate click -> upgrade-modal-shown -> checkout-started`. The current tracked events do not include page visit, translate click, upgrade-modal-shown, or checkout_started as distinct events. Do not fake those steps; use the measurable proxy above and file a follow-up if product wants the full funnel.
- Status: Pending dashboard creation

### 3. PDF success rate over time

- Type: Trends or Formula
- Series:
  - `pdf_uploaded`
  - `pdf_completed`
- Formula: `pdf_completed / pdf_uploaded`
- Display: line chart, daily, last 14 days
- Status: Pending dashboard creation

### 4. Average translation time per model

- Type: Trends
- Event: `text_translate_completed`
- Aggregation: average of property `durationMs`
- Breakdown: `modelId`
- Display: line chart or table, last 14 days
- Status: Pending dashboard creation

### 5. Top error codes from internal logs

- Type: Trends or SQL
- Event: `internal_log`
- Filter: `level = "error"`
- Breakdown: `errorCode`
- Instrumentation prerequisite: **missing** for current production events. Add `errorCode` to API logger calls that represent quota/PDF/provider failure categories, or emit a dedicated error analytics event, before this insight is considered usable.
- Display: table, last 7 days
- Status: Pending instrumentation + dashboard creation

## Weekly Check

Run every Monday UTC after launch:

1. Open the dashboard URL.
2. Confirm each insight has data or an explicitly understood no-data reason.
3. Check for instrumentation gaps and file follow-up issues.
4. Record the check below.

| Date (UTC) | Dashboard URL | Data usable? | Gaps found | Operator |
|---|---|---|---|---|
| Pending | Pending | Pending | Pending | Pending |
```

- [ ] **Step 2: Link from incident runbook**

In `docs/ops/runbook-translation-incidents.md`, under `## PostHog event integrity check`, add this line immediately after the heading:

```md
Dashboard specification and weekly check log: [PostHog Operations Dashboard Runbook](runbook-posthog-dashboard.md).
```

- [ ] **Step 3: Run docs verification**

Run:

```bash
rg -n "GetU Ops - Launch Health|DAU split|Translate funnel|PDF success rate|Average translation time|Top error codes|Do not mark issue #230 complete|runbook-posthog-dashboard" docs/ops
```

Expected: all required dashboard sections and the incident-runbook link are present.

- [ ] **Step 4: Commit**

```bash
git add docs/ops/runbook-posthog-dashboard.md docs/ops/runbook-translation-incidents.md
git commit -m "docs(ops): add posthog dashboard runbook"
```

## Task 2: Review, PR, CI, And Merge

**Files:**
- Verify `docs/ops/runbook-posthog-dashboard.md`
- Verify `docs/ops/runbook-translation-incidents.md`

- [ ] **Step 1: Request subagent review**

Ask a reviewer to check:

- The runbook includes all five required insights from issue #230.
- It does not claim external PostHog dashboard setup is complete.
- It includes a dashboard URL placeholder and first weekly check table.
- It is honest about currently missing instrumentation for full roadmap funnel steps.
- PR body should use `Refs #230`, not `Closes #230`, unless real dashboard URL/check data are added.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/m7-b5-posthog-dashboards
```

Expected: pre-push hook passes and branch is pushed.

- [ ] **Step 3: Open PR**

```bash
gh pr create --base main --head feature/m7-b5-posthog-dashboards --title "docs(ops): add posthog dashboard runbook" --body-file -
```

PR body:

```md
## Summary
- Add a reproducible PostHog ops dashboard specification for the five M7-B5 insights.
- Link the dashboard runbook from the translation incident runbook.
- Document external dashboard setup and first weekly check as pending until real PostHog access is used.

## Tests
- `rg -n "GetU Ops - Launch Health|DAU split|Translate funnel|PDF success rate|Average translation time|Top error codes|Do not mark issue #230 complete|runbook-posthog-dashboard" docs/ops`
- pre-push hook

Refs #230
```

- [ ] **Step 4: Wait for CI and merge**

```bash
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
```

Expected: CI green and PR merged. If local `main` worktree conflict appears, confirm remote merged state with:

```bash
gh pr view <pr-number> --json state,mergeCommit,url
```

## Acceptance Mapping

- Dashboard linked in runbook: Task 1 adds the runbook and link.
- First weekly check shows usable data: documented but externally pending until real dashboard is created and checked.
- Five required insights: Task 1 includes all five, with instrumentation gaps called out instead of faked.
