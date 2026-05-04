# M7-C1 AuthGate Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AuthGate` require an explicit, locale-aware fallback so future callers cannot accidentally render the current hardcoded zh-CN default.

**Architecture:** Narrow web polish change. Remove the optional fallback/default prompt from `apps/web/components/AuthGate.tsx`, encode the requirement in the TSX component prop type, add a runtime invariant for MDX/compiled callers, and add a targeted test that scans MDX `AuthGate` usage for explicit `fallback`. Keep existing loading/authed/unauthed behavior unchanged except that unauthed always renders the caller-provided fallback.

**Tech Stack:** Next.js 15 app, React 19, TypeScript `tsc --noEmit`, Vitest for existing pure AuthGate state tests.

---

## Scope And Files

- Modify `apps/web/components/AuthGate.tsx`: make fallback exclude `undefined`, update prop comment, add a runtime invariant, remove hardcoded default zh-CN fallback.
- Modify `apps/web/components/__tests__/AuthGate.test.ts`: add an MDX usage scan so future `.mdx` callers cannot omit `fallback` silently.
- Verify current MDX call sites already pass locale-aware `fallback`; no i18n message changes are needed.

## Task 1: Require Fallback In AuthGate

**Files:**
- Modify: `apps/web/components/AuthGate.tsx`
- Verify: `apps/web/components/__tests__/AuthGate.test.ts`

- [ ] **Step 1: Confirm current call sites**

Run:

```bash
rg -n "<AuthGate" apps/web -g "*.tsx" || true
rg -n "<AuthGate" apps/web -g "*.mdx"
```

Expected: no TSX call sites in the current repo state; MDX call sites must all include `fallback`. If new call sites appear, inspect each and add an explicit localized fallback before changing the prop type.

- [ ] **Step 2: Write the minimal component change**

Change `apps/web/components/AuthGate.tsx` from:

```tsx
export function AuthGate({
  children,
  fallback,
}: {
  children: ReactNode
  /** Optional custom fallback. Default: a small "Login to view" prompt. */
  fallback?: ReactNode
}) {
```

to:

```tsx
export function AuthGate({
  children,
  fallback,
}: {
  children: ReactNode
  /** Required locale-aware fallback shown when the user is not authenticated. */
  fallback: RequiredFallback
}) {
```

Define `RequiredFallback` as `Exclude<ReactNode, undefined>` and add a runtime invariant immediately after prop destructuring:

```tsx
  if (fallback === undefined) {
    throw new Error("AuthGate requires an explicit locale-aware fallback prop")
  }
```

Then change the unauthed branch from:

```tsx
  if (!isAuthed) {
    return (
      <>
        {fallback ?? (
          <div className="auth-gate-prompt">
            <p>登录后查看完整内容</p>
            <a href="/log-in">登录</a>
          </div>
        )}
      </>
    )
  }
```

to:

```tsx
  if (!isAuthed) {
    return <>{fallback}</>
  }
```

- [ ] **Step 3: Run targeted verification**

Run:

```bash
pnpm --filter @getu/web exec vitest run components/__tests__/AuthGate.test.ts
pnpm --filter @getu/web type-check
```

Expected: PASS. The TSX type-check is the acceptance gate for TypeScript callers, and the Vitest MDX scan is the acceptance gate for `.mdx` callers.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/AuthGate.tsx apps/web/components/__tests__/AuthGate.test.ts
git commit -m "fix(web): require authgate fallback"
```

## Task 2: Review, PR, CI, And Merge

**Files:**
- Verify `apps/web/components/AuthGate.tsx`

- [ ] **Step 1: Request subagent review**

Ask a reviewer to check:

- `fallback` is required at the TypeScript prop level.
- MDX call sites are protected by an automated scan and runtime invariant.
- The hardcoded zh-CN fallback is removed.
- Existing gating behavior remains: loading placeholder while pending, fallback when unauthed, children when authed.
- No existing call site omits fallback.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/m7-c1-authgate-fallback
```

Expected: pre-push hook passes and branch is pushed.

- [ ] **Step 3: Open PR**

```bash
gh pr create --base main --head feature/m7-c1-authgate-fallback --title "fix(web): require authgate fallback" --body-file -
```

PR body:

```md
## Summary
- Make `AuthGate` require an explicit fallback prop.
- Remove the hardcoded zh-CN default fallback from the shared component.
- Verify there are no existing TSX or MDX AuthGate call sites missing fallback.

## Tests
- `rg -n "<AuthGate" apps/web -g "*.tsx" || true`
- `rg -n "<AuthGate" apps/web -g "*.mdx"`
- `pnpm --filter @getu/web exec vitest run components/__tests__/AuthGate.test.ts`
- `pnpm --filter @getu/web type-check`
- pre-push hook

Closes #231
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

- TS compile error if any future TSX caller omits fallback: Task 1 makes `fallback` required.
- MDX callers cannot omit fallback silently: Task 1 adds a runtime invariant plus a Vitest MDX usage scan.
- Locale-aware fallback required: caller must now supply its own fallback, usually using page locale/messages.
- Current hardcoded zh-CN default removed: Task 1 deletes the default prompt branch.
