# PostHog Operations Dashboard Runbook

Status: **configured in PostHog Cloud**.

This runbook defines the standing PostHog dashboard required by M7-B5. It is intentionally reproducible because the dashboard itself lives in PostHog Cloud and cannot be reviewed in git.

## Dashboard

| Field | Value |
|---|---|
| Dashboard name | `GetU Ops - Launch Health` |
| PostHog dashboard URL | https://us.posthog.com/project/399124/dashboard/1544830 |
| Owner | Andy Peng |
| Created at | 2026-05-05 03:10 UTC |
| First weekly check | 2026-05-05 03:12 UTC |

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

## Dashboard Insights

| Insight | URL | First check result |
|---|---|---|
| M7-B5 DAU split by free/pro | https://us.posthog.com/project/399124/insights/U8YUBPTg | Query runs. Current production rows have no `tier` property, so the breakdown is `unknown` until tier instrumentation is added. |
| M7-B5 Translate funnel proxy | https://us.posthog.com/project/399124/insights/bCfGZwsE | Query runs. First check found 6 `text_translate_completed` events and 0 `pro_upgrade_triggered` events for 2026-04-27. |
| M7-B5 PDF success rate | https://us.posthog.com/project/399124/insights/xi98BnNy | Query runs. First check found no `pdf_uploaded` or `pdf_completed` rows in the selected period. |
| M7-B5 Average translation time per model | https://us.posthog.com/project/399124/insights/bbXrIcXY | Query runs. First check found `google` average duration of 677.67 ms for 2026-04-27. |
| M7-B5 Top internal error keys | https://us.posthog.com/project/399124/insights/IAvn2x42 | Query runs. First check found no `internal_log` error rows in the last 7 days. |

## Required Insights

### 1. DAU split by free/pro

- Type: Trends
- Event: any of `text_translate_completed`, `pdf_uploaded`, `pdf_completed`, `pro_upgrade_triggered`
- Aggregation: unique users by day
- Breakdown: `tier`
- Instrumentation prerequisite: **missing**. Add a tier property to analytics events or sync a PostHog person property from entitlements before this chart is considered usable.
- Display: stacked bar, last 14 days
- Status: Dashboard created; tier instrumentation still pending

### 2. Translate funnel

- Type: Funnel
- Steps:
  1. `text_translate_completed`
  2. `pro_upgrade_triggered`
  3. `checkout_started` - pending instrumentation
- Display: conversion rate, last 14 days
- Note: The original roadmap says `visit -> translate click -> upgrade-modal-shown -> checkout-started`. The current tracked events do not include page visit, translate click, upgrade-modal-shown, or checkout_started as distinct events. Do not fake those steps; use the measurable proxy above and file a follow-up if product wants the full funnel.
- Status: Dashboard created with measurable proxy

### 3. PDF success rate over time

- Type: Trends or Formula
- Series:
  - `pdf_uploaded`
  - `pdf_completed`
- Formula: `pdf_completed / pdf_uploaded`
- Display: line chart, daily, last 14 days
- Status: Dashboard created; waiting for production PDF events

### 4. Average translation time per model

- Type: Trends
- Event: `text_translate_completed`
- Aggregation: average of property `durationMs`
- Breakdown: `modelId`
- Display: line chart or table, last 14 days
- Status: Dashboard created

### 5. Top error codes from internal logs

- Type: Trends or SQL
- Event: `internal_log`
- Filter: `level = "error"`
- Breakdown: `errorCode`
- Instrumentation prerequisite: **missing** for current production events. Add `errorCode` to API logger calls that represent quota/PDF/provider failure categories, or emit a dedicated error analytics event, before this insight is considered usable.
- Display: table, last 7 days
- Status: Dashboard created; `errorCode` instrumentation still pending

## Weekly Check

Run every Monday UTC after launch:

1. Open the dashboard URL.
2. Confirm each insight has data or an explicitly understood no-data reason.
3. Check for instrumentation gaps and file follow-up issues.
4. Record the check below.

| Date (UTC) | Dashboard URL | Data usable? | Gaps found | Operator |
|---|---|---|---|---|
| 2026-05-05 03:12 | https://us.posthog.com/project/399124/dashboard/1544830 | Partially usable | Text translation and average duration have data. PDF events are absent in the selected period. DAU tier breakdown falls back to `unknown` because current events do not carry `tier`. Top internal error keys had no last-7-day rows. | Andy Peng / Codex |
