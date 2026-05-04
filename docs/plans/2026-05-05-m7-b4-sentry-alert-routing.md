# M7-B4 Sentry Alert Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sentry alert routing operationally executable by documenting exact production rules, notification targets, rule URL capture, and first-test-event verification steps in the incident runbook.

**Architecture:** This is an ops-only issue; repository work is limited to documentation that an operator can follow in Sentry Cloud. The actual alert rules and first test notification must be performed in the Sentry Dashboard with workspace credentials that are not available in this Codex environment. The PR must not claim external dashboard configuration is complete unless actual rule URLs and verification timestamps are supplied.

**Tech Stack:** Sentry Cloud issue alerts / metric alerts, Slack/email notification targets, Cloudflare Workers Sentry SDK already wired by `apps/api/src/worker.ts`, Markdown runbook verification.

---

## Scope And Files

- Create/modify `docs/ops/runbook-translation-incidents.md`: replace the current short Sentry alert section with a concrete rule matrix, setup procedure, test-event procedure, and verification record table.
- No application code changes.
- No `wrangler.toml` or secret changes; `SENTRY_DSN` is already documented in `apps/api/DEPLOY-CHECKLIST.md`.

## Important Constraint

This plan cannot complete the external acceptance criterion by itself:

- Required external action: Sentry Dashboard → Alerts → create rules.
- Required external verification: first test error fires email/Slack within 5 minutes.
- Required repo update after external action: fill actual Sentry rule URLs and verification timestamp in `docs/ops/runbook-translation-incidents.md`.

If no Sentry credentials are available, the PR should use `Refs #227`, not `Closes #227`.

## Task 1: Expand Sentry Alert Routing Runbook

**Files:**
- Modify: `docs/ops/runbook-translation-incidents.md`

- [ ] **Step 1: Replace the short Sentry section**

Replace the existing `## Sentry alert routing` section with:

```md
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
```

- [ ] **Step 2: Run documentation checks**

Run:

```bash
rg -n "provider-failed-new-issue|error-spike-ops|scheduled-handler-new-issue|Actual rule URL|Do not mark issue #227 complete" docs/ops/runbook-translation-incidents.md
```

Expected: all required rule ids and guardrail text are present.

- [ ] **Step 3: Commit**

```bash
git add docs/ops/runbook-translation-incidents.md
git commit -m "docs(ops): add sentry alert routing runbook"
```

## Task 2: Review, PR, CI, And Merge

**Files:**
- Verify `docs/ops/runbook-translation-incidents.md`

- [ ] **Step 1: Request subagent review**

Ask a reviewer to check:

- The runbook names the three required alert routes from issue #227.
- It does not claim external dashboard setup is complete.
- It provides a place for actual Sentry rule URLs and delivery verification.
- It is clear that #227 remains externally pending unless real URLs/results are added.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/m7-b4-sentry-alerts
```

Expected: pre-push hook passes and branch is pushed.

- [ ] **Step 3: Open PR**

```bash
gh pr create --base main --head feature/m7-b4-sentry-alerts --title "docs(ops): add sentry alert routing runbook" --body-file -
```

PR body:

```md
## Summary
- Expand the incident runbook with the required Sentry alert routing rules.
- Add placeholders for actual Sentry rule URLs and first-notification verification.
- Document that external Sentry dashboard setup is still required before #227 can be closed.

## Tests
- `rg -n "provider-failed-new-issue|error-spike-ops|scheduled-handler-new-issue|Actual rule URL|Do not mark issue #227 complete" docs/ops/runbook-translation-incidents.md`
- pre-push hook

Refs #227
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

- Sentry dashboard rule creation: documented, but requires external credentials.
- Email/Slack test within 5 minutes: documented with verification table, but requires external operator action.
- Actual rule URLs in runbook: table is present and intentionally pending until real URLs are known.
