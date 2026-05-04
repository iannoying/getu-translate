# M7-C3 API Console Logger Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace remaining `console.warn` / `console.error` calls in `apps/api/src` with the shared API logger.

**Architecture:** Add a small audit test that scans API source for forbidden `console.warn/error` usage, then replace runtime call sites with `logger.warn/error` while preserving message text and structured props. Keep direct console calls only inside `apps/api/src/analytics/logger.ts` and its logger unit test because those files define/assert the console sink.

**Tech Stack:** Cloudflare Workers, Hono, oRPC context, Vitest, existing `apps/api/src/analytics/logger.ts`.

---

## Scope And Files

- Create `apps/api/src/analytics/__tests__/console-audit.test.ts`: source-level guard for future regressions.
- Modify `apps/api/src/index.ts`: auth handler error log.
- Modify `apps/api/src/worker.ts`: scheduled task error and queue missing-bucket warning.
- Modify `apps/api/src/queue/translate-document.ts`: PDF queue warnings/errors.
- Modify `apps/api/src/middleware/rate-limit.ts`: missing KV warning.
- Modify `apps/api/src/middleware/__tests__/rate-limit.test.ts`: assert `logger.warn` instead of direct `console.warn`.
- Modify `apps/api/src/translate/document.ts`: from-url dev/rollback/queue warnings.
- Modify `apps/api/src/orpc/translate/document.ts`: document create dev/rollback/queue warnings.
- Modify `apps/api/src/ai/proxy.ts`: AI quota/charge warnings.
- Modify `apps/api/src/billing/webhook-handler.ts`: Paddle webhook errors.
- Modify `apps/api/src/billing/stripe-webhook-handler.ts`: Stripe webhook errors.
- Modify `apps/api/src/env.ts`: update stale comment that mentions `console.warn`.

## Task 1: Add Console Audit Test

**Files:**
- Create: `apps/api/src/analytics/__tests__/console-audit.test.ts`

- [ ] **Step 1: Create the failing audit test**

Create `apps/api/src/analytics/__tests__/console-audit.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const API_SRC = join(process.cwd(), "src")
const ALLOWED = new Set([
  "analytics/logger.ts",
  "analytics/__tests__/logger.test.ts",
])

describe("api console logging audit", () => {
  it("keeps console.warn/error inside the logger module only", () => {
    const violations: string[] = []
    const forbiddenConsole = new RegExp("console\\.(warn|error)")

    for (const file of listSourceFiles(API_SRC)) {
      const rel = relative(API_SRC, file)
      if (ALLOWED.has(rel)) continue

      const source = readFileSync(file, "utf8")
      const lines = source.split("\n")
      for (const [index, line] of lines.entries()) {
        if (forbiddenConsole.test(line)) {
          violations.push(`${rel}:${index + 1}:${line.trim()}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(path))
    } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      out.push(path)
    }
  }
  return out
}
```

- [ ] **Step 2: Run the failing audit test**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/analytics/__tests__/console-audit.test.ts
```

Expected: FAIL. The failure should list current `console.warn/error` violations in API runtime/test/comment files.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add apps/api/src/analytics/__tests__/console-audit.test.ts
git commit -m "test(api): audit console warn error usage"
```

## Task 2: Replace Entry, Worker, Queue, And Rate-Limit Logs

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/src/queue/translate-document.ts`
- Modify: `apps/api/src/middleware/rate-limit.ts`
- Modify: `apps/api/src/middleware/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Replace auth handler log**

In `apps/api/src/index.ts`, add:

```ts
import { logger } from "./analytics/logger"
```

Replace:

```ts
console.error("[auth] handler threw", err)
```

with:

```ts
logger.error("[auth] handler threw", { err }, { env: c.env, executionCtx: c.executionCtx })
```

- [ ] **Step 2: Replace worker logs**

In `apps/api/src/worker.ts`, add:

```ts
import { logger } from "./analytics/logger"
```

Replace scheduled task failure:

```ts
console.error("[scheduled] task failed", r.reason)
```

with:

```ts
logger.error("[scheduled] task failed", { err: r.reason }, { env, executionCtx: ctx })
```

Replace queue missing-bucket warning:

```ts
console.warn("[worker.queue] BUCKET_PDFS not bound, acking all messages")
```

with:

```ts
logger.warn(
  "[worker.queue] BUCKET_PDFS not bound, acking all messages",
  {},
  { env, executionCtx: ctx },
)
```

Leave `console.info("[scheduled]", r.value)` unchanged; C3 acceptance is scoped to warn/error.

- [ ] **Step 3: Replace PDF queue logs**

In `apps/api/src/queue/translate-document.ts`, add:

```ts
import { logger } from "../analytics/logger"
```

Use these replacements:

| Existing message | New call |
|---|---|
| `"[queue.translate-document] unexpected error"` | `logger.error("[queue.translate-document] unexpected error", { jobId: msg.body.jobId, err }, { env: opts.env })` |
| `"[queue.translate-document] job not found"` | `logger.warn("[queue.translate-document] job not found", { jobId }, { env: opts.env })` |
| `"[queue.translate-document] unexpected sourceKey shape"` | `logger.error("[queue.translate-document] unexpected sourceKey shape", { jobId, sourceKey: job.sourceKey }, { env: opts.env })` |
| `"[queue.translate-document] source object missing"` | `logger.warn("[queue.translate-document] source object missing", { jobId, key: job.sourceKey }, { env: opts.env })` |
| `"[queue.translate-document] R2 put failed"` | `logger.error("[queue.translate-document] R2 put failed", { jobId, err }, { env: opts.env })` |
| `"[queue.translate-document] render/output failed"` | `logger.error("[queue.translate-document] render/output failed", { jobId, err }, { env: opts.env })` |
| `"[queue.translate-document] refund: no original usage row found"` | `logger.warn("[queue.translate-document] refund: no original usage row found", { jobId: job.id }, { env: opts.env })` |
| `"[queue.translate-document] refund failed"` | `logger.error("[queue.translate-document] refund failed", { jobId: job.id, err }, { env: opts.env })` |

Leave `console.info` calls unchanged.

- [ ] **Step 4: Replace rate-limit warning**

In `apps/api/src/middleware/rate-limit.ts`, add:

```ts
import { logger } from "../analytics/logger"
```

Replace:

```ts
console.warn(
  "[rate-limit] RATE_LIMIT_KV binding missing — failing open. Configure wrangler.toml.",
)
```

with:

```ts
logger.warn("[rate-limit] RATE_LIMIT_KV binding missing — failing open. Configure wrangler.toml.")
```

- [ ] **Step 5: Update rate-limit test**

In `apps/api/src/middleware/__tests__/rate-limit.test.ts`, add:

```ts
import { logger } from "../../analytics/logger"
```

Change the test name from:

```ts
it("missing RATE_LIMIT_KV binding → fail-open with console.warn (don't 500 the whole worker)", async () => {
```

to:

```ts
it("missing RATE_LIMIT_KV binding → fail-open with logger.warn (don't 500 the whole worker)", async () => {
```

Replace the spy block:

```ts
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
try {
  const r = await fetch(new Request("https://x/test", { headers: { "x-test-user": "u1" } }))
  expect(r.status).toBe(200) // fail-open
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringMatching(/RATE_LIMIT_KV/),
  )
} finally {
  warnSpy.mockRestore()
}
```

with:

```ts
const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {})
try {
  const r = await fetch(new Request("https://x/test", { headers: { "x-test-user": "u1" } }))
  expect(r.status).toBe(200) // fail-open
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringMatching(/RATE_LIMIT_KV/),
  )
} finally {
  warnSpy.mockRestore()
}
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/middleware/__tests__/rate-limit.test.ts src/analytics/__tests__/console-audit.test.ts
pnpm --filter @getu/api type-check
```

Expected: audit still FAILS because later task files are not yet converted; rate-limit tests and type-check PASS. If Vitest exits non-zero because the audit is still failing, confirm the only failing test is the audit and continue.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/api/src/index.ts apps/api/src/worker.ts apps/api/src/queue/translate-document.ts apps/api/src/middleware/rate-limit.ts apps/api/src/middleware/__tests__/rate-limit.test.ts
git commit -m "refactor(api): route worker logs through logger"
```

## Task 3: Replace Document, AI Proxy, And Webhook Logs

**Files:**
- Modify: `apps/api/src/translate/document.ts`
- Modify: `apps/api/src/orpc/translate/document.ts`
- Modify: `apps/api/src/ai/proxy.ts`
- Modify: `apps/api/src/billing/webhook-handler.ts`
- Modify: `apps/api/src/billing/stripe-webhook-handler.ts`
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Replace from-url document logs**

In `apps/api/src/translate/document.ts`, add:

```ts
import { logger } from "../analytics/logger"
```

Replace:

```ts
console.warn("[document/from-url] BUCKET_PDFS missing — skipping R2 upload (dev)")
```

with:

```ts
logger.warn("[document/from-url] BUCKET_PDFS missing — skipping R2 upload (dev)", {}, { env: c.env, executionCtx: c.executionCtx })
```

Replace:

```ts
console.warn("[document/from-url] failed to rollback job row after quota failure", delErr)
```

with:

```ts
logger.warn("[document/from-url] failed to rollback job row after quota failure", { err: delErr }, { env: c.env, executionCtx: c.executionCtx })
```

Replace:

```ts
console.warn("[document/from-url] TRANSLATE_QUEUE missing — job will not auto-start")
```

with:

```ts
logger.warn("[document/from-url] TRANSLATE_QUEUE missing — job will not auto-start", {}, { env: c.env, executionCtx: c.executionCtx })
```

- [ ] **Step 2: Replace oRPC document logs**

In `apps/api/src/orpc/translate/document.ts`, add:

```ts
import { logger } from "../../analytics/logger"
```

Replace:

```ts
console.warn("[documentCreate] BUCKET_PDFS missing — trusting client sourcePages (dev)")
```

with:

```ts
logger.warn("[documentCreate] BUCKET_PDFS missing — trusting client sourcePages (dev)", {}, { env: context.env, executionCtx: context.executionCtx })
```

Replace:

```ts
console.warn("[documentCreate] failed to rollback job row after quota failure", delErr)
```

with:

```ts
logger.warn("[documentCreate] failed to rollback job row after quota failure", { err: delErr }, { env: context.env, executionCtx: context.executionCtx })
```

Replace:

```ts
console.warn("[documentCreate] TRANSLATE_QUEUE missing — job will not auto-start")
```

with:

```ts
logger.warn("[documentCreate] TRANSLATE_QUEUE missing — job will not auto-start", {}, { env: context.env, executionCtx: context.executionCtx })
```

- [ ] **Step 3: Replace AI proxy logs**

In `apps/api/src/ai/proxy.ts`, add:

```ts
import { logger } from "../analytics/logger"
```

Use these replacements:

```ts
logger.warn("[ai-proxy] quota preflight failed", {
  userId,
  quotaBucket,
  err: String(err),
}, { env, executionCtx: ctx })
```

```ts
logger.warn("[ai-proxy] charge failed", {
  userId,
  model,
  requestId,
  quotaBucket,
  err: String(err),
}, { env, executionCtx: ctx })
```

For `chargeAfterStream`, change the signature to accept `env: WorkerEnv`:

```ts
async function chargeAfterStream(
  db: ReturnType<typeof createDb>,
  userId: string,
  model: ProModel,
  usageP: Promise<{ input: number; output: number } | null>,
  requestId: string,
  quotaBucket: AiProxyQuotaBucket,
  env: WorkerEnv,
): Promise<void> {
```

Update both callers:

```ts
ctx.waitUntil(chargeAfterStream(db, userId, model, usageP, requestId, quotaBucket, env))
ctx.waitUntil(chargeAfterStream(db, userId, model, Promise.resolve(usage), requestId, quotaBucket, env))
```

Inside `chargeAfterStream`, replace the final warning with:

```ts
logger.warn("[ai-proxy] charge failed", {
  userId,
  model,
  requestId,
  quotaBucket,
  err: String(err),
}, { env })
```

- [ ] **Step 4: Replace webhook logs**

In `apps/api/src/billing/webhook-handler.ts`, add:

```ts
import { logger } from "../analytics/logger"
```

Replace Paddle insert/apply `console.error` calls with:

```ts
logger.error("[paddle-webhook] insert event failed", { err }, { env: c.env, executionCtx: c.executionCtx })
logger.error("[paddle-webhook] apply failed", { err }, { env: c.env, executionCtx: c.executionCtx })
```

In `apps/api/src/billing/stripe-webhook-handler.ts`, add:

```ts
import { logger } from "../analytics/logger"
```

Replace Stripe insert/apply `console.error` calls with:

```ts
logger.error("[stripe-webhook] insert event failed", { err }, { env: c.env, executionCtx: c.executionCtx })
logger.error("[stripe-webhook] apply failed", { err }, { env: c.env, executionCtx: c.executionCtx })
```

- [ ] **Step 5: Update env comment**

In `apps/api/src/env.ts`, change:

```ts
// and skips enqueue with a console.warn).
```

to:

```ts
// and skips enqueue with a logger warning).
```

- [ ] **Step 6: Run final audit and targeted tests**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/analytics/__tests__/console-audit.test.ts src/analytics/__tests__/logger.test.ts src/middleware/__tests__/rate-limit.test.ts src/ai/__tests__/proxy.test.ts src/billing/__tests__/webhook-handler.test.ts src/billing/__tests__/stripe-webhook-handler.test.ts src/queue/__tests__/translate-document.test.ts src/translate/__tests__/from-url-route.test.ts src/orpc/__tests__/document-extras.test.ts
pnpm --filter @getu/api type-check
rg -n "console\\.(warn|error)" apps/api/src -g '!analytics/logger.ts' -g '!analytics/__tests__/logger.test.ts' -g '!analytics/__tests__/console-audit.test.ts'
```

Expected: Vitest PASS, type-check PASS, `rg` produces no output.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/api/src/translate/document.ts apps/api/src/orpc/translate/document.ts apps/api/src/ai/proxy.ts apps/api/src/billing/webhook-handler.ts apps/api/src/billing/stripe-webhook-handler.ts apps/api/src/env.ts apps/api/src/analytics/__tests__/console-audit.test.ts
git commit -m "refactor(api): replace remaining warn error logs"
```

## Task 4: Review, PR, CI, And Merge

**Files:**
- Verify complete diff against `origin/main`.

- [ ] **Step 1: Request subagent review**

Ask reviewers to check:

- Audit test enforces the C3 acceptance criterion.
- Remaining direct `console.warn/error` are limited to `analytics/logger.ts` and its unit test.
- Replacements preserve message text and structured context.
- Error logs that have a Hono/oRPC/Worker execution context pass `{ env, executionCtx }` where available.
- No scripts or web app console calls were pulled into this API-only issue.

- [ ] **Step 2: Push branch**

Run:

```bash
git push -u origin feature/m7-c3-console-logger
```

Expected: pre-push hook passes and branch is pushed.

- [ ] **Step 3: Open PR**

Run:

```bash
gh pr create --base main --head feature/m7-c3-console-logger --title "refactor(api): replace console warn error with logger" --body-file -
```

PR body:

```md
## Summary
- Add an API source audit test for forbidden `console.warn/error`.
- Replace remaining API runtime warn/error logs with the shared logger.
- Preserve logger module/test as the only direct console sink.

## Tests
- `pnpm --filter @getu/api exec vitest run src/analytics/__tests__/console-audit.test.ts src/analytics/__tests__/logger.test.ts src/middleware/__tests__/rate-limit.test.ts src/ai/__tests__/proxy.test.ts src/billing/__tests__/webhook-handler.test.ts src/billing/__tests__/stripe-webhook-handler.test.ts src/queue/__tests__/translate-document.test.ts src/translate/__tests__/from-url-route.test.ts src/orpc/__tests__/document-extras.test.ts`
- `pnpm --filter @getu/api type-check`
- `rg -n "console\\.(warn|error)" apps/api/src -g '!analytics/logger.ts' -g '!analytics/__tests__/logger.test.ts' -g '!analytics/__tests__/console-audit.test.ts'`
- pre-push hook

Closes #233
```

- [ ] **Step 4: Wait for CI and merge**

Run:

```bash
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
```

Expected: CI green and PR merged. If local `main` worktree conflict appears, confirm remote merged state with:

```bash
gh pr view <pr-number> --json state,mergeCommit,url
```

## Acceptance Mapping

- Zero `console.warn/error` in API runtime outside logger: Task 1 audit plus Task 2/3 replacements.
- Opt-out comments/allowlist where appropriate: audit allows only `analytics/logger.ts` and `analytics/__tests__/logger.test.ts`.
- Existing tests should not break: Task 2/3 run focused tests and API type-check.
