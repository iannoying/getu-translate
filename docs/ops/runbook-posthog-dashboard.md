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
| `pdf_uploaded` | Web `/document` client via API analytics route | `pageCount`, `fileSizeBytes` | Used as PDF funnel start. |
| `pdf_completed` | Web document preview client via API analytics route | `jobId`, `pageCount`, `durationMs` | Used for PDF success rate and duration. |
| `pro_upgrade_triggered` | Web translate/document upgrade prompts via API analytics route | `source` or plan/provider fields depending call site | Used as upgrade-intent signal. |
| `internal_log` | API logger PostHog fan-out | `level`, `message`, plus caller props such as `errorCode` | B2 makes info/warn console-only by default; error forwards by default. |

Current limitation: there is no dedicated `checkout_started` event in the analytics contract. Until that is added, the translate funnel uses `pro_upgrade_triggered` as the final measurable step and labels checkout-started as pending instrumentation.

## Required Insights

### 1. DAU split by free/pro

- Type: Trends
- Event: any of `text_translate_completed`, `pdf_uploaded`, `pdf_completed`, `pro_upgrade_triggered`
- Aggregation: unique users by day
- Breakdown: user tier if available; otherwise create two temporary series:
  - authenticated users: `distinct_id != "anonymous"`
  - anonymous users: `distinct_id = "anonymous"`
- Display: stacked bar, last 14 days
- Status: Pending dashboard creation

### 2. Translate funnel

- Type: Funnel
- Steps:
  1. `text_translate_completed`
  2. `pro_upgrade_triggered`
  3. `checkout_started` - pending instrumentation
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
- Breakdown: `errorCode` if present; fallback to `message`
- Display: table, last 7 days
- Status: Pending dashboard creation

## Weekly Check

Run every Monday UTC after launch:

1. Open the dashboard URL.
2. Confirm each insight has data or an explicitly understood no-data reason.
3. Check for instrumentation gaps and file follow-up issues.
4. Record the check below.

| Date (UTC) | Dashboard URL | Data usable? | Gaps found | Operator |
|---|---|---|---|---|
| Pending | Pending | Pending | Pending | Pending |
