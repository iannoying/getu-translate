# Translation Incidents Runbook

Operational guide for the 4 most common production incidents in the web translate / document pipeline.

## Quick reference

| Symptom | First check | Section |
|---|---|---|
| User reports "PDF stuck on processing" | Cron schedule + queue depth | [Queue lag](#queue-lag) |
| Translate page shows "model not available" | `pricing_plans.models` value | [Model ID drift](#model-id-drift) |
| User reports wrong quota counts | `usageLog` + `quotaPeriod` per user | [Quota anomaly](#quota-anomaly) |
| Monthly bill suddenly higher | Workers / R2 / Queue / D1 / Sentry / PostHog dashboards | [Cost alert thresholds](#cost-alert-thresholds) |

---

## Queue lag

**Symptom:** PDF translation jobs stuck in `status='processing'` (or never transition out of `queued`).

**Diagnose:**
1. Check Cloudflare Queue dashboard for `getu-translate-jobs` — how many messages sitting?
2. Check `wrangler tail` for the api Worker — any queue handler logs?
3. Check D1: `SELECT status, COUNT(*) FROM translation_jobs GROUP BY status` — are processing rows accumulating?

**Common causes & fixes:**
- **Queue consumer not deployed**: a deploy went out without `[[queues.consumers]]` in wrangler.toml. Verify in CF dashboard → Queues → getu-translate-jobs → Consumer column.
- **LLM provider 5xx**: queue handler is retrying. Check Sentry for `transient_llm` error_code spikes. Wait for upstream to recover.
- **Stuck-sweep + retry working but slow**: cron is daily at 03:00 UTC. If users hit this off-hours, manually trigger via dashboard → Workers → getu-api → Triggers.

**Escalation:**
- If `processing` rows > 100 for > 1h, manually mark stuck via D1: `UPDATE translation_jobs SET status='failed', error_code='generic', error_message='手动重置 — 请重试', failed_at=unixepoch()*1000 WHERE status='processing' AND created_at < unixepoch()*1000 - 3600000;` then trigger retry cron.

---

## Model ID drift

**Symptom:** User clicks Translate, the column for a specific model returns "model not available" or 404.

**Diagnose:**
1. Check `packages/definitions/providers.ts` for the model id in question — is it spelled correctly?
2. Check `pricing_plans` table on D1: `SELECT plan, models FROM pricing_plans` — does the JSON `models` array include that id?
3. Check the LLM provider (BIANXIE_BASE_URL) directly — has the provider renamed/deprecated this model upstream?

**Common causes & fixes:**
- **Provider deprecated a model**: update `packages/definitions/providers.ts` to remove the deprecated id. Bump `pricing_plans.models` JSON via a one-off SQL update on D1. Deploy.
- **Typo in PR**: revert or hotfix.
- **Provider added a new id**: same fix as deprecation but additive.

**Prevention:** M7 should add a startup check that pings each model id against the BIANXIE proxy on first request and caches; misses surface as warnings to Sentry.

---

## Quota anomaly

**Symptom:** User says "I translated 5 docs but my quota shows 50 used."

**Diagnose:**
1. Pull the user's `usageLog` rows: `SELECT * FROM usage_log WHERE user_id = '...' ORDER BY created_at DESC LIMIT 50;`
2. Pull the user's `quotaPeriod`: `SELECT * FROM quota_period WHERE user_id = '...';`
3. Compare `usageLog.amount` SUM vs `quotaPeriod.used` per bucket.
4. Check for refund rows (`requestId LIKE 'refund:%'` with negative `amount`) — are they balancing failed jobs?

**Common causes & fixes:**
- **Refund didn't fire**: M6.12 has a known fix for the requestId mismatch (now uses `web-pdf:{userId}:{jobId}` shape). If the refund row is missing for a failed job, manually insert: `INSERT INTO usage_log (id, user_id, bucket, amount, request_id, created_at, period_key) VALUES (uuid, '...', 'web_pdf_translate_monthly', -PAGES, 'refund:JOBID', NOW, PERIOD)` then `UPDATE quota_period SET used = MAX(used + AMOUNT, 0) WHERE user_id='...' AND bucket='...' AND period_key='...';`
- **Concurrent translates over-decremented**: M6.3 uses a `clickId` to coalesce N column calls into 1. If somehow N decrements happened, hand-fix per above.
- **Period rollover bug**: check `period_key` shape — should be `YYYY-MM` for monthly buckets. If different, that's a bug worth filing.

**Escalation:**
- Tag the user, refund manually if appropriate, and link the case to a GitHub issue for the underlying root cause.

---

## Cost alert thresholds

**Symptom:** Monthly bill spiked unexpectedly.

**What to check:**

| Service | Free tier | Where to monitor | Action if exceeded |
|---|---|---|---|
| Cloudflare Workers | 100K req/day | Workers Analytics | Check for traffic spike / abuse |
| Cloudflare D1 | 5M rows read/day, 100K writes/day | D1 Analytics | Optimize hot queries; check for cron storm |
| Cloudflare R2 | 10GB storage, 1M Class A ops/month, 10M Class B ops/month | R2 metrics | Check object count via `wrangler r2 object list`; cleanup cron should keep this bounded |
| Cloudflare Queues | 1M msgs/month free | Queue dashboard | Should be ~1 msg per PDF upload — anomaly = retry storm |
| PostHog Cloud | 1M events/month free | PostHog → Project → Settings → Usage | Reduce event verbosity if exceeded |
| Sentry Cloud | 5K errors/month free (Developer plan) | Sentry → Stats → Quotas | Investigate error spike; add Sentry sampling if intentional |
| BIANXIE / LLM | Per-provider | Their dashboard | Spike = abusive user or quota bug |

**General mitigation:**
- Add rate limit per user/IP at the api edge (M7 candidate)
- Implement spend cap monitoring + Slack alerts (M7 candidate)
- Spot-check the `usageLog` table sum against actual upstream LLM bill

## Sentry alert routing

Status: **pending external Sentry dashboard configuration**.

Sentry already receives Worker errors when the production `SENTRY_DSN` secret is set. The missing production step is routing those issues to humans.

### Required rules

| Rule id | Sentry rule type | Query / condition | Threshold | Action | Destination | Actual rule URL |
|---|---|---|---|---|---|---|
| `provider-failed-new-issue` | Issue alert | New issue where `level:error` and message or tag contains `translate.providerFailed` | First seen | Notify | Engineer Slack channel | Pending |
| `error-spike-ops` | Metric alert | Events matching `level:error` | `> 10` events in `1h` | Notify | Ops Slack channel | Pending |
| `scheduled-handler-new-issue` | Issue alert | New issue where message contains `[scheduled] task failed` or transaction/context is cron/scheduled | First seen | Notify | Engineer email | Pending |

### Setup steps

1. Open Sentry → GetU API project → Alerts.
2. Create `provider-failed-new-issue`:
   - Type: Issue Alert
   - Condition: A new issue is created.
   - Filter: `level:error` and `translate.providerFailed`.
   - Action: send Slack notification to the engineer channel.
   - Save the rule and paste its URL into the table above.
3. Create `error-spike-ops`:
   - Type: Metric Alert
   - Dataset: Errors.
   - Filter: `level:error`.
   - Condition: event count greater than `10` over `1 hour`.
   - Action: send Slack notification to the ops channel.
   - Save the rule and paste its URL into the table above.
4. Create `scheduled-handler-new-issue`:
   - Type: Issue Alert
   - Condition: A new issue is created.
   - Filter: message contains `[scheduled] task failed` or the Sentry issue originates from the Worker `scheduled` handler.
   - Action: send email to the engineering owner.
   - Save the rule and paste its URL into the table above.

### Verification

After creating the rules, send one safe test event and confirm notification delivery within 5 minutes.

Preferred verification path:

1. In Sentry, use **Project Settings → Client Keys (DSN) → Test DSN** or Sentry's built-in alert test action for each rule.
2. Confirm the destination receives the notification.
3. Record the result here:

| Date (UTC) | Rule id | Test issue/event URL | Destination observed | Latency | Operator |
|---|---|---|---|---|---|
| Pending | `provider-failed-new-issue` | Pending | Pending | Pending | Pending |
| Pending | `error-spike-ops` | Pending | Pending | Pending | Pending |
| Pending | `scheduled-handler-new-issue` | Pending | Pending | Pending | Pending |

Do not mark issue #227 complete until all `Pending` entries above are replaced with actual URLs and observed delivery results.

## PostHog event integrity check

Dashboard specification and weekly check log: [PostHog Operations Dashboard Runbook](runbook-posthog-dashboard.md).

Quick sanity query in PostHog SQL:

```sql
SELECT event, count() FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY count() DESC
```

Expected events from M6.13:
- `text_translate_completed`
- `pdf_uploaded`
- `pdf_completed`
- `pro_upgrade_triggered`

If any are missing for >24h with users active, the analytics pipeline is broken — check `apps/api/src/orpc/analytics.ts` and Worker logs.
