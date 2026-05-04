# M7-C4 Actions Cache Node 24 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove GitHub Actions Node 20 cache-action deprecation warnings by upgrading direct `actions/cache` usage to Node 24.

**Architecture:** `actions/cache@v5` is released and runs on Node 24. This repo has direct `actions/cache@v4` usage only in deploy workflows; PR test already uses `actions/setup-node@v6` built-in pnpm cache. Upgrade direct cache actions to `@v5` and add a grep verification so future regressions are caught during review.

**Tech Stack:** GitHub Actions YAML, `actions/cache@v5`, hosted `ubuntu-latest` runners.

---

## Scope And Files

- Modify `.github/workflows/deploy-api.yml`: change direct `actions/cache@v4` to `actions/cache@v5`.
- Modify `.github/workflows/deploy-web.yml`: change direct `actions/cache@v4` to `actions/cache@v5`.
- Verify `.github/workflows/pr-test.yml`: no direct `actions/cache@v4` is present; it uses `actions/setup-node@v6` with `cache: pnpm`.
- Create this plan at `docs/plans/2026-05-05-m7-c4-actions-cache-node24.md`.

## Task 1: Upgrade Direct Cache Actions

**Files:**
- Modify: `.github/workflows/deploy-api.yml`
- Modify: `.github/workflows/deploy-web.yml`
- Verify: `.github/workflows/pr-test.yml`

- [ ] **Step 1: Confirm v5 precondition**

Run:

```bash
gh api repos/actions/cache/releases/latest --jq '{tag_name, published_at}'
```

Expected: latest tag is `v5.x`. `actions/cache@v5` runs on Node 24 and requires Actions Runner `2.327.1+`; this repo uses GitHub-hosted `ubuntu-latest`, so no self-hosted runner change is needed.

- [ ] **Step 2: Write the workflow changes**

In `.github/workflows/deploy-api.yml`, replace:

```yaml
      - uses: actions/cache@v4
```

with:

```yaml
      - uses: actions/cache@v5
```

In `.github/workflows/deploy-web.yml`, replace:

```yaml
      - uses: actions/cache@v4
```

with:

```yaml
      - uses: actions/cache@v5
```

Do not modify `pr-test.yml`; its cache path comes through `actions/setup-node@v6`:

```yaml
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: pnpm
```

- [ ] **Step 3: Verify no v4 cache action remains**

Run:

```bash
rg -n "actions/cache@v4" .github/workflows
rg -n "actions/cache@v5|setup-node@v6|cache: pnpm" .github/workflows/deploy-api.yml .github/workflows/deploy-web.yml .github/workflows/pr-test.yml
```

Expected: first command returns no output; second command shows `actions/cache@v5` in deploy workflows and `setup-node@v6` / `cache: pnpm` in PR test.

- [ ] **Step 4: Commit**

Run:

```bash
git add .github/workflows/deploy-api.yml .github/workflows/deploy-web.yml
git commit -m "ci: upgrade actions cache to node 24"
```

## Task 2: Review, PR, CI, And Merge

**Files:**
- Verify complete diff against `origin/main`.

- [ ] **Step 1: Request subagent review**

Ask reviewers to check:

- Both direct `actions/cache@v4` usages are now `actions/cache@v5`.
- No `actions/cache@v4` remains anywhere in `.github/workflows`.
- `pr-test.yml` was correctly left on `actions/setup-node@v6` built-in pnpm cache.
- No unrelated deploy-api better-sqlite3 ABI workaround steps changed.

- [ ] **Step 2: Push branch**

Run:

```bash
git push -u origin feature/m7-c4-actions-cache-node24
```

Expected: pre-push hook passes and branch is pushed.

- [ ] **Step 3: Open PR**

Run:

```bash
gh pr create --base main --head feature/m7-c4-actions-cache-node24 --title "ci: upgrade actions cache to node 24" --body-file -
```

PR body:

```md
## Summary
- Upgrade deploy workflow direct `actions/cache` usage from v4 to v5.
- Verify PR test already uses `actions/setup-node@v6` pnpm cache.
- Leave deploy-api better-sqlite3 rebuild workaround untouched.

## Tests
- `gh api repos/actions/cache/releases/latest --jq '{tag_name, published_at}'`
- `rg -n "actions/cache@v4" .github/workflows`
- `rg -n "actions/cache@v5|setup-node@v6|cache: pnpm" .github/workflows/deploy-api.yml .github/workflows/deploy-web.yml .github/workflows/pr-test.yml`
- pre-push hook

Closes #234
```

- [ ] **Step 4: Wait for CI and merge**

Run:

```bash
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
```

Expected: PR CI green and PR merged. If local `main` worktree conflict appears, confirm remote merged state with:

```bash
gh pr view <pr-number> --json state,mergeCommit,url
```

## Acceptance Mapping

- No `actions/cache@v4` deprecation warning source remains: Task 1 upgrades both direct usages and verifies no v4 references.
- C4 precondition met: Task 1 confirms `actions/cache` latest release is v5.x.
- PR test cache remains Node 24-compatible: `actions/setup-node@v6` is already used with Node 24 and `cache: pnpm`.
