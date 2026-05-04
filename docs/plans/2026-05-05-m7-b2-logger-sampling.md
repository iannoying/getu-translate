# M7-B2 Logger Sampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make API logger PostHog forwarding safe by default: `info` and `warn` stay console-only unless explicitly forwarded, while `error` always forwards when env and execution context are available.

**Architecture:** Extend logger call options with forwarding controls and sampling. The forwarding gate runs after console output, checks env/context/key as today, then applies level defaults plus optional per-call `forward` and `sampleRate` overrides before calling `captureEvent`.

**Tech Stack:** Cloudflare Workers ExecutionContext · PostHog capture helper · Vitest 4 · TypeScript.

---

## File Structure

- Modify `apps/api/src/analytics/logger.ts`: add `forward` and `sampleRate` options, default forwarding policy, and deterministic skip behavior for sampled-out calls.
- Modify `apps/api/src/analytics/__tests__/logger.test.ts`: cover console behavior, default forwarding gate, warn opt-in, error default forwarding, sampling, and missing env/context.

---

## Task 1: Forwarding Gate Defaults

**Files:**
- Modify: `apps/api/src/analytics/logger.ts`
- Modify: `apps/api/src/analytics/__tests__/logger.test.ts`

- [ ] **Step 1: Write failing tests for default forwarding policy**

In `apps/api/src/analytics/__tests__/logger.test.ts`, update imports to include `captureEvent` after the mock:

```ts
import { captureEvent } from "../posthog"
```

Add these tests:

```ts
describe("logger forwarding gate", () => {
  it("does not forward info to PostHog by default even when env+ctx are present", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.info("info msg", { userId: "u-info" }, { env, executionCtx: mockExecutionCtx })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("does not forward warn to PostHog by default even when env+ctx are present", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.warn("warn msg", { userId: "u-warn" }, { env, executionCtx: mockExecutionCtx })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("forwards warn when explicitly opted in", async () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.warn(
      "warn msg",
      { userId: "u-warn" },
      { env, executionCtx: mockExecutionCtx, forward: true },
    )

    expect(mockWaitUntil).toHaveBeenCalledOnce()
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "phc_test",
        distinctId: "u-warn",
        event: "internal_log",
        properties: expect.objectContaining({ level: "warn", message: "warn msg" }),
      }),
    )
  })

  it("does not forward error when explicitly disabled", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("err", { userId: "u-error" }, { env, executionCtx: mockExecutionCtx, forward: false })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run logger tests to verify they fail**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/analytics/__tests__/logger.test.ts
```

Expected: FAIL because current `info`/`warn` forward whenever env+ctx exist and `LogContext` does not include `forward`.

- [ ] **Step 3: Implement default gate**

In `apps/api/src/analytics/logger.ts`, update `LogContext`:

```ts
export type LogContext = {
  env?: WorkerEnv
  /** Cloudflare ExecutionContext for fire-and-forget PostHog fan-out. */
  executionCtx?: ExecutionContext
  /**
   * Override PostHog forwarding for this call.
   * Default: error=true, warn=false, info=false.
   */
  forward?: boolean
}
```

Add helper:

```ts
function shouldForward(level: LogLevel, opts: LogContext): boolean {
  if (opts.forward !== undefined) return opts.forward
  return level === "error"
}
```

Then change the PostHog forwarding guard from:

```ts
  if (opts.env?.POSTHOG_PROJECT_KEY && opts.executionCtx) {
```

to:

```ts
  if (shouldForward(level, opts) && opts.env?.POSTHOG_PROJECT_KEY && opts.executionCtx) {
```

- [ ] **Step 4: Run logger tests**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/analytics/__tests__/logger.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/api/src/analytics/logger.ts apps/api/src/analytics/__tests__/logger.test.ts
git commit -m "fix(api): default logger posthog forwarding to errors"
```

---

## Task 2: Sampling Controls

**Files:**
- Modify: `apps/api/src/analytics/logger.ts`
- Modify: `apps/api/src/analytics/__tests__/logger.test.ts`

- [ ] **Step 1: Write failing sampling tests**

Add these tests to `apps/api/src/analytics/__tests__/logger.test.ts`:

```ts
describe("logger sampling", () => {
  it("does not forward when sampleRate is 0", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("sampled out", {}, { env, executionCtx: mockExecutionCtx, sampleRate: 0 })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it("forwards when sampleRate is 1", async () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("sampled in", { userId: "u-sample" }, { env, executionCtx: mockExecutionCtx, sampleRate: 1 })

    expect(mockWaitUntil).toHaveBeenCalledOnce()
    await (mockWaitUntil.mock.calls[0] as [Promise<unknown>])[0]
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "u-sample",
        properties: expect.objectContaining({ message: "sampled in" }),
      }),
    )
  })

  it("treats out-of-range sampleRate values as disabled forwarding", () => {
    const env = { POSTHOG_PROJECT_KEY: "phc_test" } as any
    logger.error("bad sample", {}, { env, executionCtx: mockExecutionCtx, sampleRate: -1 })
    logger.error("bad sample", {}, { env, executionCtx: mockExecutionCtx, sampleRate: 2 })
    expect(mockWaitUntil).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run logger tests to verify they fail**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/analytics/__tests__/logger.test.ts
```

Expected: FAIL because `sampleRate` is not implemented.

- [ ] **Step 3: Implement sampling**

In `apps/api/src/analytics/logger.ts`, extend `LogContext`:

```ts
  /**
   * Per-call sampling rate for PostHog forwarding.
   * Must be between 0 and 1. Defaults to 1 when forwarding is enabled.
   */
  sampleRate?: number
```

Add helper:

```ts
function passesSample(sampleRate: number | undefined): boolean {
  if (sampleRate === undefined) return true
  if (sampleRate < 0 || sampleRate > 1) return false
  if (sampleRate === 0) return false
  if (sampleRate === 1) return true
  return Math.random() < sampleRate
}
```

Update the forwarding guard:

```ts
  if (
    shouldForward(level, opts) &&
    passesSample(opts.sampleRate) &&
    opts.env?.POSTHOG_PROJECT_KEY &&
    opts.executionCtx
  ) {
```

- [ ] **Step 4: Run logger tests and type-check**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/analytics/__tests__/logger.test.ts
pnpm --filter @getu/api type-check
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/api/src/analytics/logger.ts apps/api/src/analytics/__tests__/logger.test.ts
git commit -m "feat(api): add logger posthog sampling controls"
```

---

## Task 3: Verification And Review

**Files:**
- No code files unless verification reveals a bug.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm --filter @getu/api exec vitest run src/analytics/__tests__/logger.test.ts src/analytics/__tests__/posthog.test.ts
```

Expected: pass.

- [ ] **Step 2: Run API type-check**

Run:

```bash
pnpm --filter @getu/api type-check
```

Expected: pass.

- [ ] **Step 3: Grep audit**

Run:

```bash
rg -n "logger\\.(info|warn|error)|forward:|sampleRate|internal_log" apps/api/src
```

Expected:
- Existing logger call sites still compile.
- `logger.error` call sites do not need changes.
- Any `logger.warn` forwarding requires explicit `forward: true`.

- [ ] **Step 4: Commit verification-only fixes if needed**

If a verification failure required edits:

```bash
git add <changed-paths>
git commit -m "test(api): cover logger forwarding gate"
```

---

## Self-Review

- Spec coverage: The plan covers default info/warn console-only behavior, warn opt-in, error forwarding, and tests for forwarding gate.
- Placeholder scan: No placeholder implementation steps remain.
- Type consistency: The call option is consistently named `forward`; sampling uses `sampleRate`.
- Scope: No logger call sites are changed unless type-check reveals an incompatible signature.

## Acceptance Mapping

| Acceptance | Verification |
|---|---|
| `logger.info()` does not forward by default | Task 1 default forwarding test |
| `logger.warn()` does not forward by default | Task 1 default forwarding test |
| `logger.warn()` can opt into forwarding | Task 1 `forward: true` test |
| `logger.error()` forwards by default | Existing error tests remain |
| Forwarding gate is tested | Task 1 and Task 2 tests |
| Sampling config exists | Task 2 `sampleRate` tests |
