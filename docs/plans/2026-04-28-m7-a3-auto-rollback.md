# M7-A3 — Auto-rollback on Deploy Smoke Test Failure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** When `wrangler deploy` succeeds but the post-deploy smoke test fails, the workflow automatically rolls the Worker back to the previous version so production never sits broken longer than ~30 seconds. Pages does not have a clean CLI rollback path — for `/web` we just alert + document the manual rollback procedure.

**Architecture:**
- `deploy-api.yml`: capture the **previous** Worker version id before `wrangler deploy`, run `pnpm smoke:prod` with `continue-on-error: true`, and on smoke failure run `wrangler rollback --version-id <previous>` then fail the job loudly.
- `smoke-prod.ts`: gain a `SMOKE_FORCE_FAIL=true` env hook so the rollback path is testable via `workflow_dispatch` input `force_smoke_fail`. **Closed-by-default** — only fires when the input is set, never affects regular deploys.
- `deploy-web.yml`: post-deploy curl on `https://getutranslate.com` for a 200; on failure print a clear actionable message linking to the Pages dashboard for manual rollback. (CLI-driven Pages rollback is messy — `wrangler pages deployments list/delete` doesn't promote a previous deployment to production. Doing this safely is a separate, larger task.)
- DEPLOY-CHECKLIST.md gains an "M7-A3 — Verification & manual rollback" section.

**Tech Stack:** GitHub Actions YAML · `wrangler versions list` / `wrangler rollback` · existing `pnpm smoke:prod` (tsx) · curl.

**Why per-task split:**
- yaml + script changes are small but require live verification, so plan is short (4 tasks + push/PR).
- No unit-test path — verification is `workflow_dispatch` against production with `force_smoke_fail: true`.

**Out of scope:**
- Pages auto-rollback CLI (deferred — needs custom CF API call to promote previous deployment, which is a M7+ task).
- PostHog `deploy_rollback` event / Sentry breadcrumb — plan author thought this was nice-to-have. Skipping to keep PR small; can add as M7-B follow-up.
- Multi-step canary / progressive rollout. Out of M7 scope.

---

## 0. Pre-flight

Worktree: `/Users/andy.peng/workspace/repo/getu-translate/.claude/worktrees/keen-leakey-7e4d0d` (current). Branch `feature/m7-a3` already created from `origin/main`.

```bash
git rev-parse --abbrev-ref HEAD   # feature/m7-a3
git status --short                # only docs/plans/2026-04-28-m7-a3-auto-rollback.md untracked
git log -1 --oneline              # b2599d7d chore(api): set rate_limit_kv namespace ids (m7-a2 fast-follow) (#239)
```

**No new env vars / secrets / bindings required.** Existing `CLOUDFLARE_API_TOKEN` already has Workers:Edit permission (otherwise current deploy wouldn't work). `wrangler rollback` uses the same token.

---

## Task 1 — Add `SMOKE_FORCE_FAIL` test hook to `smoke-prod.ts`

**Files:**
- Modify: `apps/api/scripts/smoke-prod.ts`

**Why first:** The hook is purely for testing the rollback path; gates the rest of the plan. Adding it first means Task 3 (workflow_dispatch trigger) can wire to a real escape hatch on Day 1.

**Step 1.1: Modify `main()` to honor the hook**

Add at the top of `main()`, before `console.log`:

```ts
if (process.env.SMOKE_FORCE_FAIL === "true") {
  console.error("SMOKE_FORCE_FAIL=true — exiting 1 to test the auto-rollback path")
  process.exit(1)
}
```

**Step 1.2: Manual sanity check**

```bash
cd apps/api
SMOKE_FORCE_FAIL=true pnpm smoke:prod
echo "exit: $?"
```

Expected: exit 1 with the explanation printed. Without the env, behavior unchanged (existing 4 checks against api.getutranslate.com).

**Step 1.3: Commit**

```bash
git add apps/api/scripts/smoke-prod.ts
git commit -m "feat(api): add smoke_force_fail env hook for rollback testing"
```

---

## Task 2 — Implement Worker auto-rollback in `deploy-api.yml`

**Files:**
- Modify: `.github/workflows/deploy-api.yml`

**Step 2.1: Add `workflow_dispatch` input + capture-previous-version step**

Replace the existing `on:` and `steps:` sections so the job becomes:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/api/**'
      - 'packages/db/**'
      - 'packages/contract/**'
      - 'packages/definitions/**'
      - '.github/workflows/deploy-api.yml'
  workflow_dispatch:
    inputs:
      force_smoke_fail:
        description: "Set to true to force smoke test failure and exercise the auto-rollback path."
        type: boolean
        default: false
```

**Step 2.2: Insert `Capture previous version id` BEFORE the `Deploy worker` step**

```yaml
      - name: Capture previous Worker version id (for rollback)
        id: prev-version
        working-directory: apps/api
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          # `wrangler versions list --json` returns newest-first.
          # The first item is the version currently live in production
          # (immediately about to become "previous" after the next deploy).
          PREV=$(pnpm exec wrangler versions list --env production --json 2>/dev/null \
                 | head -200 \
                 | node -e "
                   let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
                     const arr=JSON.parse(s);
                     if(!Array.isArray(arr)||arr.length===0){console.error('no versions');process.exit(2)}
                     console.log(arr[0].id);
                   });
                 ")
          if [ -z "$PREV" ]; then
            echo "Could not determine previous version id; rollback will be unavailable."
            echo "previous=" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "Previous version id: $PREV"
          echo "previous=$PREV" >> "$GITHUB_OUTPUT"
```

**Step 2.3: Update the `Run smoke test` step to allow continuation + plumb `SMOKE_FORCE_FAIL`**

```yaml
      - name: Run smoke test
        id: smoke
        continue-on-error: true
        working-directory: apps/api
        env:
          API_BASE_URL: https://api.getutranslate.com
          SMOKE_FORCE_FAIL: ${{ inputs.force_smoke_fail || 'false' }}
        run: pnpm smoke:prod
```

**Step 2.4: Insert rollback step AFTER smoke**

```yaml
      - name: Rollback worker if smoke failed
        if: steps.smoke.outcome == 'failure' && steps.prev-version.outputs.previous != ''
        working-directory: apps/api
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          PREV='${{ steps.prev-version.outputs.previous }}'
          echo "Rolling back to version $PREV"
          pnpm exec wrangler rollback \
            --env production \
            --version-id "$PREV" \
            --message "auto-rollback: smoke test failed in run ${{ github.run_id }}"

      - name: Fail the job after rollback
        if: steps.smoke.outcome == 'failure'
        run: |
          echo "::error::Smoke test failed; worker rolled back to previous version (or rollback skipped if no previous version)."
          exit 1
```

**Step 2.5: Smoke-test the YAML locally**

`act` is overkill; just confirm `yamllint`-style basics:

```bash
yq eval '.jobs.deploy.steps[].name' .github/workflows/deploy-api.yml
```

Expected: list includes "Capture previous Worker version id (for rollback)", "Run smoke test", "Rollback worker if smoke failed", "Fail the job after rollback" in that order.

**Step 2.6: Commit**

```bash
git add .github/workflows/deploy-api.yml
git commit -m "feat(ci): auto-rollback worker on smoke test failure"
```

---

## Task 3 — Add post-deploy smoke + manual-rollback alert in `deploy-web.yml`

**Files:**
- Modify: `.github/workflows/deploy-web.yml`

**Why no auto-rollback for Pages:** `wrangler pages deployments list` returns deployments, but there's no CLI command that promotes a previous deployment back to the production alias. The clean way is via the Cloudflare API (`PATCH .../deployments/{id}/aliases/production`), which is custom code and a larger surface than this PR. M7-A3 ships the Worker auto-rollback path and documents the Pages manual procedure; full Pages auto-rollback is a follow-up.

**Step 3.1: Append a smoke + alert block after the existing deploy step**

```yaml
      - name: Smoke test (production web)
        id: smoke
        continue-on-error: true
        run: |
          set -eux
          # Hit the home page; expect 200. CF Pages serves stale on origin
          # error so a 5xx here is unusual and indicates a real failure.
          curl -fsS -o /dev/null -w "HTTP %{http_code}\n" https://getutranslate.com/

      - name: Alert on web smoke failure (no auto-rollback for Pages)
        if: steps.smoke.outcome == 'failure'
        run: |
          echo "::error::Web smoke test failed against https://getutranslate.com/."
          echo "::error::Cloudflare Pages does not have a CLI auto-rollback. Manual rollback steps:"
          echo "::error::  1. https://dash.cloudflare.com/?to=/:account/pages/view/getu-web/"
          echo "::error::  2. Find the previous successful deployment, click ⋯ → 'Rollback to this deployment'"
          echo "::error::Or follow the procedure documented in apps/api/DEPLOY-CHECKLIST.md § M7-A3."
          exit 1
```

**Step 3.2: Commit**

```bash
git add .github/workflows/deploy-web.yml
git commit -m "ci(web): post-deploy smoke + manual rollback alert"
```

---

## Task 4 — Document verification + manual rollback in `DEPLOY-CHECKLIST.md`

**Files:**
- Modify: `apps/api/DEPLOY-CHECKLIST.md`

**Step 4.1: Append a new section at the end**

```markdown
## M7-A3 — Auto-rollback Verification & Manual Procedures

### Worker (api) — Auto-rollback

`deploy-api.yml` rolls the Worker back to the previous version automatically when `pnpm smoke:prod` exits non-zero after deploy. To verify the rollback path works:

1. Go to **GitHub → Actions → Deploy API → Run workflow**.
2. Set `force_smoke_fail = true`. Trigger.
3. Workflow should:
   - Capture the previous version id (current production)
   - Deploy the new version
   - Smoke test exits 1 with `SMOKE_FORCE_FAIL=true`
   - `wrangler rollback --version-id <previous>` runs
   - Job fails with a clear error
4. Verify production is back on the previous version: `cd apps/api && pnpm exec wrangler versions list --env production --json | head -50` — the version with `metadata.message` containing "auto-rollback" should be the latest entry, and the version BEFORE it (the one referenced in the rollback message) should be the live one.

### Worker (api) — Manual rollback

If auto-rollback fails (e.g. token permissions issue) or you need to rollback past a successful deploy:

```bash
cd apps/api
pnpm exec wrangler versions list --env production --json | head -50
# Find the version id you want to roll back to.
pnpm exec wrangler rollback --env production --version-id <id> --message "manual rollback: <reason>"
# Verify
curl -sf https://api.getutranslate.com/health | jq .
```

### Web (Pages) — Manual rollback

Cloudflare Pages does not have CLI auto-rollback. If `deploy-web.yml` smoke test fails:

1. Open https://dash.cloudflare.com/?to=/:account/pages/view/getu-web/
2. Click the **Deployments** tab.
3. Find the most recent successful deployment (NOT the failed one).
4. Click ⋯ → **Rollback to this deployment**.
5. Confirm.
6. Verify: `curl -sf https://getutranslate.com/ | head -5`.
```

**Step 4.2: Commit**

```bash
git add apps/api/DEPLOY-CHECKLIST.md
git commit -m "docs(api): m7-a3 rollback verification + manual procedures"
```

---

## Task 5 — Push + PR + merge

**Step 5.1: Run pre-push (hook does extension tests; should pass)**

```bash
git push -u origin feature/m7-a3
```

If pre-push flakes per `feedback_pr_submission_flow` memory, retry once.

**Step 5.2: Open PR**

```bash
gh pr create --base main --title "feat(ci): worker auto-rollback on smoke fail (m7-a3, closes #225)" --body "$(cat <<'EOF'
## Summary
Auto-rollback the production Worker when post-deploy smoke test fails. Pages gets a smoke + alert (manual rollback per dashboard).

- **Worker auto-rollback** in `.github/workflows/deploy-api.yml`:
  - Capture previous version id before deploy
  - Smoke test runs with `continue-on-error: true`
  - On smoke failure: `wrangler rollback --version-id <previous> --message "auto-rollback: smoke test failed in run <id>"`
  - Job fails with clear error after rollback
- **Test hook** `SMOKE_FORCE_FAIL=true` in `apps/api/scripts/smoke-prod.ts` lets us exercise the rollback path via `workflow_dispatch` input `force_smoke_fail` without breaking real prod
- **Web** (`deploy-web.yml`): post-deploy curl 200 check, on failure print actionable manual rollback steps. CLI-driven Pages auto-rollback is deferred (Cloudflare CLI doesn't expose deployment-promote).
- **DEPLOY-CHECKLIST.md** new "M7-A3" section documents both auto-rollback verification (using `force_smoke_fail`) and manual rollback procedures for Worker + Pages.

## Verification path (post-merge, manual)
1. Merge this PR — first deploy goes through normally.
2. **GitHub → Actions → Deploy API → Run workflow → set `force_smoke_fail = true`** → trigger.
3. Confirm:
   - Smoke step shows the SMOKE_FORCE_FAIL exit
   - Rollback step runs with `wrangler rollback --version-id <previous>`
   - Job ends with red ❌ and previous version is live
4. `pnpm exec wrangler versions list --env production --json | head -50` to verify which version is live.

## Test plan
- [x] No new unit-testable code; verification is the workflow_dispatch run above
- [x] yaml syntax valid (`yq eval` keys parse)
- [x] Pre-push extension tests pass

Closes #225

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 5.3: Watch CI**

```bash
gh pr checks --watch
```

If green, manual squash-merge.

**Step 5.4: Verify rollback path works in production**

After deploy-api workflow runs the merge commit successfully:

```bash
gh workflow run deploy-api.yml -f force_smoke_fail=true
gh run watch
```

Expected: workflow ends red, rollback step ran, `wrangler versions list` shows the previous-pre-test version is live again.

**Step 5.5: Document the verification result in the PR (comment) so future plan-readers see "this was actually exercised."**

---

## Self-review checklist

- [ ] No code path that runs in normal (non-test) deploys has new behavior except the rollback-on-smoke-fail logic
- [ ] `SMOKE_FORCE_FAIL` is **closed-by-default** (only fires when env is the literal string "true")
- [ ] `workflow_dispatch` input default is `false` — push-to-main never triggers fault injection
- [ ] `prev-version` step has graceful fallback when `wrangler versions list` returns empty (rollback skipped, not crashed)
- [ ] No commits with uppercase subjects (commitlint)
- [ ] Pages limitation is explicitly documented; nobody will assume Pages auto-rolls back

---

## Acceptance mapping (issue #225)

| Acceptance | Where verified |
|---|---|
| Inject smoke fault → workflow rolls back → previous version live | Task 5.4 manual workflow_dispatch with `force_smoke_fail=true` |
| Document procedure in DEPLOY-CHECKLIST.md | Task 4 — full section added covering both Worker auto-rollback verification + manual procedures |

## Known limitations

1. **Pages no auto-rollback**: documented in plan + DEPLOY-CHECKLIST.md. Follow-up task (M7-B / M7-C) can implement via Cloudflare API.
2. **No PostHog event / Sentry breadcrumb on rollback**: plan author called these out but they're nice-to-have. Skipped to keep this PR minimal.
3. **Race window**: between `wrangler deploy` and `wrangler rollback`, the broken version is live for ~30 seconds (smoke duration + rollback time). This is the expected M7-A3 floor; reducing it requires canary / progressive rollout (out of scope).
