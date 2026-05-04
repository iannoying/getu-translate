# M7-B3 Spend Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily scheduled spend monitor that aggregates `usage_log` consumption over the previous 24 hours and sends a Slack alert when configured per-bucket thresholds are exceeded.

**Architecture:** Implement a focused scheduled job in `apps/api/src/scheduled/spend-monitor.ts` with pure helpers for threshold parsing, aggregation, and Slack payload construction. The Worker cron handler calls the job alongside existing retention/translation maintenance tasks. Thresholds are non-secret `[vars]` values in `wrangler.toml`; the Slack webhook URL is an optional secret so local and preview environments remain safe no-ops.

**Tech Stack:** Cloudflare Workers scheduled handler, D1 via `@getu/db` + drizzle-orm, Vitest 4, Slack incoming webhook JSON payloads, pnpm 10.

---

## Scope And Files

- Create `apps/api/src/scheduled/spend-monitor.ts`: exports `runSpendMonitor(db, env, opts)` plus small pure helpers. Reads `usage_log`, compares totals with thresholds, posts one Slack message if any configured bucket is over threshold, returns a bounded summary for cron logs.
- Create `apps/api/src/scheduled/__tests__/spend-monitor.test.ts`: uses `makeTestDb()` and mocked `fetch` to cover aggregation, threshold gates, Slack payload shape, missing webhook no-op, and Slack failure reporting.
- Modify `apps/api/src/env.ts`: add optional `SLACK_WEBHOOK_URL` and spend threshold env vars to `WorkerEnv`.
- Modify `apps/api/src/worker.ts`: register `runSpendMonitor` in the existing daily scheduled `Promise.allSettled` list.
- Modify `apps/api/wrangler.toml`: add default and production `[vars]` thresholds. Do not put the Slack webhook URL in TOML because it is a secret.
- Modify `apps/api/DEPLOY-CHECKLIST.md`: list `SLACK_WEBHOOK_URL` as an optional/required-for-alerts secret and document threshold vars.

## Bucket Thresholds

Use these env vars and bucket mappings:

- `SPEND_ALERT_AI_TRANSLATE_PER_DAY` -> `ai_translate_monthly`
- `SPEND_ALERT_WEB_TEXT_TRANSLATE_PER_DAY` -> `web_text_translate_count_monthly`
- `SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY` -> `web_text_translate_token_monthly`
- `SPEND_ALERT_DOCUMENT_PAGES_PER_DAY` -> `document_translate_page_monthly`
- `SPEND_ALERT_AI_RATE_LIMIT_WRITES_PER_DAY` -> `ai_rate_limit`

Default values in `wrangler.toml`:

- `SPEND_ALERT_AI_TRANSLATE_PER_DAY = "100000"`
- `SPEND_ALERT_WEB_TEXT_TRANSLATE_PER_DAY = "50000"`
- `SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY = "500000"`
- `SPEND_ALERT_DOCUMENT_PAGES_PER_DAY = "200"`
- `SPEND_ALERT_AI_RATE_LIMIT_WRITES_PER_DAY = "20000"`

Parsing behavior:

- Missing, empty, non-numeric, negative, or zero threshold values disable that bucket.
- Totals are compared with `actual > threshold`, not `>=`, so exactly-at-threshold does not alert.
- Only rows where `created_at >= now - 24h` and `created_at < now` are included.

## Task 1: Write Spend Monitor Core And Tests

**Files:**
- Create: `apps/api/src/scheduled/spend-monitor.ts`
- Create: `apps/api/src/scheduled/__tests__/spend-monitor.test.ts`

- [ ] **Step 1: Write failing tests for aggregation and threshold behavior**

Add `apps/api/src/scheduled/__tests__/spend-monitor.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { schema } from "@getu/db"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { runSpendMonitor } from "../spend-monitor"
import type { WorkerEnv } from "../../env"

const NOW_MS = new Date("2026-05-05T03:00:00.000Z").getTime()
const ONE_HOUR_AGO = new Date(NOW_MS - 60 * 60_000)
const TWENTY_FIVE_HOURS_AGO = new Date(NOW_MS - 25 * 60 * 60_000)

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY: "500",
    SPEND_ALERT_DOCUMENT_PAGES_PER_DAY: "200",
    ...overrides,
  } as WorkerEnv
}

describe("runSpendMonitor", () => {
  it("aggregates usage_log amounts by bucket over the previous 24 hours", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values([
      {
        id: "recent-token-a",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 250,
        requestId: "recent-token-a",
        createdAt: ONE_HOUR_AGO,
      },
      {
        id: "recent-token-b",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 251,
        requestId: "recent-token-b",
        createdAt: ONE_HOUR_AGO,
      },
      {
        id: "old-token",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 999_999,
        requestId: "old-token",
        createdAt: TWENTY_FIVE_HOURS_AGO,
      },
      {
        id: "recent-document",
        userId: null,
        bucket: "document_translate_page_monthly",
        amount: 199,
        requestId: "recent-document",
        createdAt: ONE_HOUR_AGO,
      },
    ])

    const result = await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    expect(result.checked).toBe(2)
    expect(result.alerted).toBe(1)
    expect(result.breaches).toEqual([
      {
        bucket: "web_text_translate_token_monthly",
        envVar: "SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY",
        actual: 501,
        threshold: 500,
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not alert below or exactly at threshold", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values([
      {
        id: "exact-token",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 500,
        requestId: "exact-token",
        createdAt: ONE_HOUR_AGO,
      },
      {
        id: "below-document",
        userId: null,
        bucket: "document_translate_page_monthly",
        amount: 199,
        requestId: "below-document",
        createdAt: ONE_HOUR_AGO,
      },
    ])

    const result = await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    expect(result.alerted).toBe(0)
    expect(result.breaches).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/spend-monitor.test.ts
```

Expected: FAIL because `../spend-monitor` does not exist.

- [ ] **Step 3: Implement minimal aggregation, threshold parsing, and no-op Slack gate**

Create `apps/api/src/scheduled/spend-monitor.ts`:

```ts
import { and, gte, lt, sql } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { WorkerEnv } from "../env"

const DAY_MS = 24 * 60 * 60_000

type ThresholdConfig = {
  bucket: string
  envVar: keyof WorkerEnv
}

export type SpendBreach = {
  bucket: string
  envVar: string
  actual: number
  threshold: number
}

export type SpendMonitorResult = {
  checked: number
  alerted: number
  breaches: SpendBreach[]
  skippedReason?: "no_thresholds" | "no_webhook"
  error?: string
}

const THRESHOLDS: ThresholdConfig[] = [
  { bucket: "ai_translate_monthly", envVar: "SPEND_ALERT_AI_TRANSLATE_PER_DAY" },
  { bucket: "web_text_translate_count_monthly", envVar: "SPEND_ALERT_WEB_TEXT_TRANSLATE_PER_DAY" },
  { bucket: "web_text_translate_token_monthly", envVar: "SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY" },
  { bucket: "document_translate_page_monthly", envVar: "SPEND_ALERT_DOCUMENT_PAGES_PER_DAY" },
  { bucket: "ai_rate_limit", envVar: "SPEND_ALERT_AI_RATE_LIMIT_WRITES_PER_DAY" },
]

export async function runSpendMonitor(
  db: Db,
  env: WorkerEnv,
  opts: { now: number; fetch?: typeof fetch; dryRun?: boolean },
): Promise<SpendMonitorResult> {
  const thresholds = parseThresholds(env)
  if (thresholds.length === 0) return { checked: 0, alerted: 0, breaches: [], skippedReason: "no_thresholds" }

  const totals = await loadUsageTotals(db, opts.now)
  const breaches = thresholds
    .map(({ bucket, envVar, threshold }) => ({
      bucket,
      envVar,
      actual: totals.get(bucket) ?? 0,
      threshold,
    }))
    .filter((entry) => entry.actual > entry.threshold)

  if (breaches.length === 0) return { checked: thresholds.length, alerted: 0, breaches: [] }
  if (!env.SLACK_WEBHOOK_URL) {
    return { checked: thresholds.length, alerted: 0, breaches, skippedReason: "no_webhook" }
  }

  if (opts.dryRun) return { checked: thresholds.length, alerted: breaches.length, breaches }

  const fetchImpl = opts.fetch ?? fetch
  const response = await fetchImpl(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildSlackPayload(breaches, opts.now)),
  })

  if (!response.ok) {
    return {
      checked: thresholds.length,
      alerted: 0,
      breaches,
      error: `slack webhook returned ${response.status}`,
    }
  }

  return { checked: thresholds.length, alerted: breaches.length, breaches }
}

function parseThresholds(env: WorkerEnv) {
  return THRESHOLDS.flatMap(({ bucket, envVar }) => {
    const raw = env[envVar]
    const threshold = typeof raw === "string" ? Number(raw) : NaN
    if (!Number.isFinite(threshold) || threshold <= 0) return []
    return [{ bucket, envVar: String(envVar), threshold }]
  })
}

async function loadUsageTotals(db: Db, now: number): Promise<Map<string, number>> {
  const since = new Date(now - DAY_MS)
  const before = new Date(now)
  const rows = await db
    .select({
      bucket: schema.usageLog.bucket,
      total: sql<number>`sum(${schema.usageLog.amount})`,
    })
    .from(schema.usageLog)
    .where(and(gte(schema.usageLog.createdAt, since), lt(schema.usageLog.createdAt, before)))
    .groupBy(schema.usageLog.bucket)

  return new Map(rows.map((row) => [row.bucket, Number(row.total ?? 0)]))
}

function buildSlackPayload(breaches: SpendBreach[], now: number) {
  const lines = breaches.map(
    (b) => `• ${b.bucket}: ${b.actual.toLocaleString("en-US")} > ${b.threshold.toLocaleString("en-US")} (${b.envVar})`,
  )
  return {
    text: `GetU spend alert: ${breaches.length} bucket(s) exceeded daily thresholds`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*GetU spend alert*\\nWindow ending: ${new Date(now).toISOString()}\\n${lines.join("\\n")}`,
        },
      },
    ],
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/spend-monitor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scheduled/spend-monitor.ts apps/api/src/scheduled/__tests__/spend-monitor.test.ts
git commit -m "feat(api): add spend monitor aggregation"
```

## Task 2: Cover Slack Payload, No-Webhook, And Failure Cases

**Files:**
- Modify: `apps/api/src/scheduled/__tests__/spend-monitor.test.ts`
- Modify: `apps/api/src/scheduled/spend-monitor.ts`

- [ ] **Step 1: Add failing tests for Slack payload details and operational edge cases**

Append these tests inside the existing `describe("runSpendMonitor", ...)` block:

```ts
  it("renders a clean Slack message with bucket name, threshold, and actual value", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values({
      id: "token-breach",
      userId: null,
      bucket: "web_text_translate_token_monthly",
      amount: 1_234_567,
      requestId: "token-breach",
      createdAt: ONE_HOUR_AGO,
    })

    await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse(String(init?.body))

    expect(body.text).toContain("GetU spend alert")
    expect(body.blocks[0].text.text).toContain("web_text_translate_token_monthly")
    expect(body.blocks[0].text.text).toContain("1,234,567")
    expect(body.blocks[0].text.text).toContain("500")
    expect(body.blocks[0].text.text).toContain("SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY")
  })

  it("returns breaches without posting when Slack webhook is not configured", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values({
      id: "token-no-webhook",
      userId: null,
      bucket: "web_text_translate_token_monthly",
      amount: 501,
      requestId: "token-no-webhook",
      createdAt: ONE_HOUR_AGO,
    })

    const result = await runSpendMonitor(db as any, env(), { now: NOW_MS, fetch: fetchMock })

    expect(result.skippedReason).toBe("no_webhook")
    expect(result.alerted).toBe(0)
    expect(result.breaches).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("disables invalid thresholds and reports no_thresholds when none remain", async () => {
    const { db } = makeTestDb()

    const result = await runSpendMonitor(
      db as any,
      env({
        SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY: "not-a-number",
        SPEND_ALERT_DOCUMENT_PAGES_PER_DAY: "0",
      }),
      { now: NOW_MS },
    )

    expect(result).toEqual({ checked: 0, alerted: 0, breaches: [], skippedReason: "no_thresholds" })
  })

  it("reports Slack webhook failures without throwing", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("bad", { status: 500 }))

    await db.insert(schema.usageLog).values({
      id: "token-slack-fail",
      userId: null,
      bucket: "web_text_translate_token_monthly",
      amount: 501,
      requestId: "token-slack-fail",
      createdAt: ONE_HOUR_AGO,
    })

    const result = await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    expect(result.alerted).toBe(0)
    expect(result.error).toBe("slack webhook returned 500")
  })
```

- [ ] **Step 2: Run test to verify the new assertions fail if Task 1 omitted an edge**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/spend-monitor.test.ts
```

Expected: PASS if Task 1 already included the shown behavior. If any assertion fails, update `spend-monitor.ts` to exactly match the expected behavior in these tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/scheduled/spend-monitor.ts apps/api/src/scheduled/__tests__/spend-monitor.test.ts
git commit -m "test(api): cover spend monitor slack alerts"
```

## Task 3: Wire Worker Env, Cron, And Deploy Docs

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/wrangler.toml`
- Modify: `apps/api/DEPLOY-CHECKLIST.md`
- Test: `apps/api/src/scheduled/__tests__/spend-monitor.test.ts`

- [ ] **Step 1: Add WorkerEnv fields**

In `apps/api/src/env.ts`, add these optional fields after `RATE_LIMIT_SMOKE_SECRET?: string`:

```ts
  // M7-B3 — daily spend monitor Slack alerting. Thresholds are [vars]; webhook is a secret.
  SLACK_WEBHOOK_URL?: string
  SPEND_ALERT_AI_TRANSLATE_PER_DAY?: string
  SPEND_ALERT_WEB_TEXT_TRANSLATE_PER_DAY?: string
  SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY?: string
  SPEND_ALERT_DOCUMENT_PAGES_PER_DAY?: string
  SPEND_ALERT_AI_RATE_LIMIT_WRITES_PER_DAY?: string
```

- [ ] **Step 2: Register the scheduled task**

In `apps/api/src/worker.ts`, add the import:

```ts
import { runSpendMonitor } from "./scheduled/spend-monitor"
```

Then add this entry to the `Promise.allSettled([...])` list:

```ts
        runSpendMonitor(db, env, { now }).then((r) => ({ task: "spend-monitor" as const, ok: true as const, ...r })),
```

- [ ] **Step 3: Add threshold vars to `wrangler.toml`**

Add this block to both `[vars]` and `[env.production.vars]`:

```toml
# M7-B3 — spend monitor thresholds. SLACK_WEBHOOK_URL is a secret, not a var.
SPEND_ALERT_AI_TRANSLATE_PER_DAY = "100000"
SPEND_ALERT_WEB_TEXT_TRANSLATE_PER_DAY = "50000"
SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY = "500000"
SPEND_ALERT_DOCUMENT_PAGES_PER_DAY = "200"
SPEND_ALERT_AI_RATE_LIMIT_WRITES_PER_DAY = "20000"
```

- [ ] **Step 4: Update deploy checklist**

In `apps/api/DEPLOY-CHECKLIST.md`, add `SLACK_WEBHOOK_URL` to the secrets table:

```md
| `SLACK_WEBHOOK_URL` | M7-B3 spend monitor Slack incoming webhook. Optional for non-prod; required for production spend alerts. |
```

Add a short section after the secrets verification block:

```md
## M7-B3 — Spend Monitor Alerts

The API Worker daily cron (`0 3 * * *`) aggregates `usage_log.amount` over the previous 24 hours by bucket and compares totals with these vars in `wrangler.toml`:

- `SPEND_ALERT_AI_TRANSLATE_PER_DAY`
- `SPEND_ALERT_WEB_TEXT_TRANSLATE_PER_DAY`
- `SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY`
- `SPEND_ALERT_DOCUMENT_PAGES_PER_DAY`
- `SPEND_ALERT_AI_RATE_LIMIT_WRITES_PER_DAY`

Set the Slack webhook secret in production:

```bash
cd apps/api
pnpm exec wrangler secret put SLACK_WEBHOOK_URL --env production
```

If the webhook is absent, the cron still computes breaches and logs `skippedReason: "no_webhook"` without posting externally. Thresholds set to missing, empty, zero, negative, or non-numeric values disable that bucket.
```

- [ ] **Step 5: Verify type-check and targeted tests**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/spend-monitor.test.ts src/scheduled/__tests__/retention.test.ts
pnpm --filter @getu/api type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/worker.ts apps/api/wrangler.toml apps/api/DEPLOY-CHECKLIST.md
git commit -m "feat(api): wire spend monitor cron alerts"
```

## Task 4: Final Verification, Review, PR, And Merge

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused verification**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/spend-monitor.test.ts src/scheduled/__tests__/retention.test.ts src/scheduled/__tests__/translation-retry.test.ts
pnpm --filter @getu/api type-check
```

Expected: PASS.

- [ ] **Step 2: Request final subagent code review**

Dispatch a code review subagent with:

- Base: `origin/main`
- Head: current branch HEAD
- Scope: `apps/api/src/scheduled/spend-monitor.ts`, `apps/api/src/scheduled/__tests__/spend-monitor.test.ts`, `apps/api/src/env.ts`, `apps/api/src/worker.ts`, `apps/api/wrangler.toml`, `apps/api/DEPLOY-CHECKLIST.md`
- Requirements: issue #226 acceptance criteria and this plan.

- [ ] **Step 3: Run pre-push by pushing the branch**

```bash
git push -u origin feature/m7-b3-spend-monitor
```

Expected: pre-push hook passes, branch pushed.

- [ ] **Step 4: Open PR**

```bash
gh pr create --base main --head feature/m7-b3-spend-monitor --title "feat(api): add spend monitor slack alerts" --body-file -
```

PR body:

```md
## Summary
- Add a daily spend monitor over `usage_log` with per-bucket thresholds.
- Send a Slack webhook alert when configured thresholds are exceeded.
- Wire the monitor into the existing API cron and document the production secret.

## Tests
- `pnpm --filter @getu/api exec vitest run src/scheduled/__tests__/spend-monitor.test.ts src/scheduled/__tests__/retention.test.ts src/scheduled/__tests__/translation-retry.test.ts`
- `pnpm --filter @getu/api type-check`
- pre-push hook

Closes #226
```

- [ ] **Step 5: Wait for CI and merge**

Run:

```bash
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
```

Expected: all checks pass and PR is merged. If `gh pr merge` reports the local `main` branch is used by another worktree, verify remote state with:

```bash
gh pr view <pr-number> --json state,mergeCommit,url
```

Expected: `state` is `MERGED`.

## Acceptance Mapping

- Aggregation correct over `usage_log`: Task 1 tests insert multiple buckets and old rows, then assert the 24h bucket totals.
- Slack message renders cleanly: Task 2 asserts bucket name, threshold env var, actual value, and threshold value appear in Slack block text.
- No alert below threshold + alert above threshold: Task 1 covers exact/below no-alert and above alert.
- Production operation documented: Task 3 updates `WorkerEnv`, `wrangler.toml`, cron registration, and deploy checklist.
