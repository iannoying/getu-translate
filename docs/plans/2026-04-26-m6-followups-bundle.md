# M6 Follow-ups Bundle (#198 + #204 HIGH only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the HIGH-severity follow-ups from PR #196 (M6.5b, issue #198) and PR #203 (M6.7, issue #204) before starting M6.9 — preventing the engineering debt from compounding.

**Architecture:** Single PR with surgical, mostly server-side fixes plus one client-side cache invalidation. No new files except tests. LOW items (#198 #6/#7, #204 #4) are explicitly deferred to M6.13 to avoid scope creep.

**Tech Stack:** vitest 4 · jsdom 29 (where applicable) · @orpc/client (for cache invalidation) · zustand/jotai stores already present.

**Pre-flight:**

- [ ] **Step 0: Verify base is green**

```bash
pnpm install --frozen-lockfile
pnpm --filter @getu/api test
pnpm --filter @getu/web build
```

Expected: All commands exit 0.

- [ ] **Step 0.1: Branch from main**

```bash
git fetch origin main
git checkout -b feature/m6-followups
```

---

## In-scope items

### From #198 (M6.5b — Microsoft + LLM stub follow-ups)

| Item | Severity | Status | Action |
|---|---|---|---|
| #1 Microsoft token caching | HIGH | ✅ done in #200 | skip |
| #2 `from=` empty string vs omit | HIGH | OPEN | **Task 1** |
| #3 AbortController on translate-client | SUGGEST | OPEN | **Task 2** (promoted because client unmount during 11-column translate is reproducible) |
| #4 Strip `statusCode` from PROVIDER_FAILED | SUGGEST | OPEN | **Task 3** (cheap; landing now) |
| #5 Missing tests (3) | SUGGEST | OPEN | **Task 4** (folded into the existing test files) |
| #6 Replace console.warn w/ structured logger | LOW | OPEN | defer to M6.13 |
| #7 Add `// TODO(M6.7)` marker | LOW | OPEN | already obsolete (M6.7 shipped) — drop |

### From #204 (M6.7 — quota badge + analytics polish)

| Item | Severity | Status | Action |
|---|---|---|---|
| #1 Real analytics wiring | HIGH | OPEN | defer to M6.13 (the proper home — pipeline + backend selection live there) |
| #2 Quota badge refresh after translate | MEDIUM | OPEN | **Task 5** (promoted because UX confusion already reported) |
| #3 E2E for upgrade modal | LOW | OPEN | defer to M6.13 |
| #4 QuotaBadge danger-tone pulse | LOW | OPEN | defer to M6.13 |

---

## File structure (PR scope)

| File | Action |
|---|---|
| `apps/api/src/translate/free-providers.ts` | Modify — fix `from=` URL build (Task 1) |
| `apps/api/src/translate/__tests__/free-providers.test.ts` | Modify — add 3 missing test cases (Task 1, Task 4) |
| `apps/api/src/orpc/translate/text.ts` | Modify — strip `statusCode` from client error data (Task 3) |
| `apps/api/src/orpc/translate/__tests__/text.test.ts` | Modify — assert `statusCode` not present in error data (Task 3) |
| `apps/web/app/[locale]/translate/translate-client.tsx` | Modify — add AbortController + invalidate entitlements after translate (Task 2, Task 5) |
| `apps/web/app/[locale]/translate/__tests__/translate-client.test.tsx` | Create — first-ever test file for this client; exercises both new behaviors (Task 2, Task 5) |

---

## Task 1 — Microsoft `from=` parameter omission for auto-detect

**Files:**
- Modify: `apps/api/src/translate/free-providers.ts:92-110` (the `microsoftTranslate` function)
- Test: `apps/api/src/translate/__tests__/free-providers.test.ts` (existing file; add cases)

**Background:** Microsoft v3 auto-detect requires the `from` param to be **omitted** entirely, not sent as empty string. Empty-string form is undefined behavior and has been observed to 400 in some edge-auth configurations. M6.5b reviewer flagged this; #198 item #2.

- [ ] **Step 1.1: Write failing test**

```ts
// apps/api/src/translate/__tests__/free-providers.test.ts — append at end of describe('microsoftTranslate')
it("omits the from query param when fromLang is 'auto'", async () => {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = typeof url === "string" ? url : url.toString()
    if (u.includes("/auth")) {
      return new Response("fake-token", { status: 200 })
    }
    // Capture URL for assertion
    capturedUrl = u
    return new Response(JSON.stringify([{ translations: [{ text: "你好" }] }]), { status: 200 })
  }) as unknown as typeof fetch
  let capturedUrl = ""

  await microsoftTranslate("hello", "auto", "zh-Hans", fetchMock)

  expect(capturedUrl).toContain("to=zh-Hans")
  expect(capturedUrl).not.toContain("from=&")
  expect(capturedUrl).not.toMatch(/from=(?!.*to=)/)  // no `from=` at all
})

it("includes from query param when fromLang is explicit", async () => {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = typeof url === "string" ? url : url.toString()
    if (u.includes("/auth")) return new Response("fake-token", { status: 200 })
    capturedUrl = u
    return new Response(JSON.stringify([{ translations: [{ text: "你好" }] }]), { status: 200 })
  }) as unknown as typeof fetch
  let capturedUrl = ""

  await microsoftTranslate("hello", "en", "zh-Hans", fetchMock)

  expect(capturedUrl).toContain("from=en")
  expect(capturedUrl).toContain("to=zh-Hans")
})
```

- [ ] **Step 1.2: Run test to verify failure**

```bash
pnpm --filter @getu/api test free-providers -- --run
```

Expected: FAIL — first test asserts `from=` not present; current code emits `from=&`.

- [ ] **Step 1.3: Implement fix**

Replace the URL construction in `microsoftTranslate`:

```ts
// apps/api/src/translate/free-providers.ts (replace existing url-building block)
const params = new URLSearchParams({
  "api-version": "3.0",
  textType: "plain",
  to: toLang,
})
if (fromLang !== "auto") {
  params.set("from", fromLang)
}
const url = `${MICROSOFT_TRANSLATE_BASE}?${params.toString()}`
```

- [ ] **Step 1.4: Run test to verify pass**

```bash
pnpm --filter @getu/api test free-providers -- --run
```

Expected: PASS for both new tests + existing tests still green.

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/src/translate/free-providers.ts apps/api/src/translate/__tests__/free-providers.test.ts
git commit -m "fix(api): omit Microsoft \`from\` param for auto-detect (M6.5b #198)"
```

---

## Task 2 — AbortController on translate-client unmount

**Files:**
- Modify: `apps/web/app/[locale]/translate/translate-client.tsx` (handleTranslate function)
- Test: `apps/web/app/[locale]/translate/__tests__/translate-client.test.tsx` (Create)

**Background:** When user navigates away mid-translate, the `Promise.allSettled` callbacks call `setResults` on an unmounted component. React 18 silences the warning but the in-flight requests still consume LLM tokens and quota. Adding `AbortController` lets us cancel both in-flight network calls AND pending `setResults`. #198 item #3.

- [ ] **Step 2.1: Set up vitest config for apps/web (if missing)**

Check whether `apps/web/vitest.config.ts` exists:

```bash
ls apps/web/vitest.config.ts apps/web/vitest.config.mts 2>/dev/null
```

If absent, create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
```

And `apps/web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
```

If `@vitejs/plugin-react` or `@testing-library/jest-dom` aren't already installed, ASK USER before adding (touches the lockfile in a way the user wanted reviewed). Otherwise, skip this step entirely and use a lighter approach (Step 2.1-alt below).

- [ ] **Step 2.1-alt: Lightweight no-React-DOM test (preferred path)**

If adding the React Testing Library deps requires user approval and we want to ship without them, restructure: extract the abort logic into a pure function `runColumnTranslations(controllers, ...)` and unit-test that function in isolation under vitest (node env, no jsdom). Document the choice as a note in the PR body.

This plan **prefers** the lightweight path. Proceed only with Step 2.1-alt unless user has pre-approved adding React Testing Library.

- [ ] **Step 2.2: Write failing test (lightweight path)**

```ts
// apps/web/app/[locale]/translate/__tests__/translate-orchestrator.test.ts (Create)
import { describe, it, expect, vi } from "vitest"
import { runColumnTranslations } from "../translate-orchestrator"

describe("runColumnTranslations", () => {
  it("aborts in-flight calls when AbortSignal fires", async () => {
    const aborted: string[] = []
    const tasks = [
      { modelId: "google", run: (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted.push("google")
            reject(new DOMException("aborted", "AbortError"))
          })
        }),
      },
      { modelId: "microsoft", run: (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted.push("microsoft")
            reject(new DOMException("aborted", "AbortError"))
          })
        }),
      },
    ]
    const ac = new AbortController()
    const promise = runColumnTranslations(tasks, ac.signal)
    setTimeout(() => ac.abort(), 10)
    const results = await promise
    expect(aborted.sort()).toEqual(["google", "microsoft"])
    expect(results.every(r => r.error?.code === "ABORTED")).toBe(true)
  })

  it("returns successful results when not aborted", async () => {
    const tasks = [
      { modelId: "google", run: async () => ({ text: "你好" }) },
    ]
    const ac = new AbortController()
    const results = await runColumnTranslations(tasks, ac.signal)
    expect(results).toEqual([{ modelId: "google", text: "你好" }])
  })
})
```

- [ ] **Step 2.3: Run test to verify failure**

```bash
pnpm --filter @getu/web test translate-orchestrator -- --run
```

Expected: FAIL — `runColumnTranslations` does not exist.

- [ ] **Step 2.4: Implement orchestrator**

Create `apps/web/app/[locale]/translate/translate-orchestrator.ts`:

```ts
export type ColumnTask = {
  modelId: string
  run: (signal: AbortSignal) => Promise<{ text: string }>
}

export type ColumnResult =
  | { modelId: string; text: string }
  | { modelId: string; error: { code: string; message?: string } }

export async function runColumnTranslations(
  tasks: ColumnTask[],
  signal: AbortSignal,
): Promise<ColumnResult[]> {
  return Promise.all(
    tasks.map(async (task): Promise<ColumnResult> => {
      try {
        const out = await task.run(signal)
        return { modelId: task.modelId, ...out }
      } catch (e) {
        const err = e as { name?: string; message?: string; code?: string }
        if (err?.name === "AbortError" || signal.aborted) {
          return { modelId: task.modelId, error: { code: "ABORTED" } }
        }
        return { modelId: task.modelId, error: { code: err?.code ?? "UNKNOWN", message: err?.message } }
      }
    }),
  )
}
```

- [ ] **Step 2.5: Run test to verify pass**

```bash
pnpm --filter @getu/web test translate-orchestrator -- --run
```

Expected: PASS.

- [ ] **Step 2.6: Wire orchestrator into translate-client.tsx**

In `translate-client.tsx`, locate the existing `handleTranslate` function and refactor:

```tsx
// translate-client.tsx (top-level inside the component)
const abortRef = useRef<AbortController | null>(null)

useEffect(() => {
  return () => {
    abortRef.current?.abort()
  }
}, [])

async function handleTranslate() {
  abortRef.current?.abort()  // cancel any in-flight
  const ac = new AbortController()
  abortRef.current = ac

  const tasks = enabledColumns.map(modelId => ({
    modelId,
    run: (signal: AbortSignal) => orpcClient.translate.translate(
      { text: input, sourceLang, targetLang, modelId },
      { signal },
    ),
  }))
  const results = await runColumnTranslations(tasks, ac.signal)
  if (ac.signal.aborted) return  // unmounted; skip setResults
  setResults(prev => mergeResults(prev, results))
  // Task 5 hook lands here.
}
```

- [ ] **Step 2.7: Verify type-check**

```bash
pnpm --filter @getu/web type-check
```

Expected: PASS.

- [ ] **Step 2.8: Commit**

```bash
git add apps/web/app/[locale]/translate/translate-orchestrator.ts \
        apps/web/app/[locale]/translate/__tests__/translate-orchestrator.test.ts \
        apps/web/app/[locale]/translate/translate-client.tsx
git commit -m "fix(web): cancel in-flight translate columns on unmount (M6.5b #198)"
```

---

## Task 3 — Strip `statusCode` from client-facing PROVIDER_FAILED data

**Files:**
- Modify: `apps/api/src/orpc/translate/text.ts` (the `PROVIDER_FAILED` ORPCError)
- Test: `apps/api/src/orpc/translate/__tests__/text.test.ts`

**Background:** The current `PROVIDER_FAILED` error includes `statusCode` in the data field, exposed to client devtools. While not a CRITICAL leak, it's unnecessary noise on the wire. #198 item #4.

- [ ] **Step 3.1: Locate the PROVIDER_FAILED throw**

```bash
grep -n "PROVIDER_FAILED" apps/api/src/orpc/translate/text.ts
```

Note the line numbers and the `data` payload shape.

- [ ] **Step 3.2: Write failing test**

```ts
// apps/api/src/orpc/translate/__tests__/text.test.ts — add new describe
describe("translate error data shape", () => {
  it("does not leak statusCode in PROVIDER_FAILED error data", async () => {
    // arrange a mock fetch that returns 503 from google
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("internal", { status: 503 }),
    ) as unknown as typeof fetch

    const ctx = await makeTestCtx({ fetchImpl: fetchMock })
    const caller = createTranslateClient(ctx)

    let captured: any
    try {
      await caller.translate({ text: "hi", sourceLang: "en", targetLang: "zh-Hans", modelId: "google" })
    } catch (e: any) {
      captured = e
    }

    expect(captured).toBeDefined()
    expect(captured.code).toBe("PROVIDER_FAILED")
    expect(captured.data).toBeDefined()
    expect(captured.data).not.toHaveProperty("statusCode")
  })
})
```

If a `makeTestCtx` / `createTranslateClient` helper does not exist, follow the pattern in adjacent tests (use the existing test infra).

- [ ] **Step 3.3: Run test to verify failure**

```bash
pnpm --filter @getu/api test orpc/translate -- --run
```

Expected: FAIL — `data.statusCode` is present.

- [ ] **Step 3.4: Implement fix**

In `text.ts`, where PROVIDER_FAILED is thrown, log the statusCode (server-side) and **omit** it from the `data` payload:

```ts
// before:
throw new ORPCError("PROVIDER_FAILED", { data: { provider, statusCode: res.status, message } })
// after:
console.error("[translate.providerFailed]", { provider, statusCode: res.status, message })
throw new ORPCError("PROVIDER_FAILED", { data: { provider, message } })
```

(Adjust to match the actual surrounding code.)

- [ ] **Step 3.5: Run test to verify pass**

```bash
pnpm --filter @getu/api test orpc/translate -- --run
```

Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add apps/api/src/orpc/translate/text.ts apps/api/src/orpc/translate/__tests__/text.test.ts
git commit -m "chore(api): drop statusCode from PROVIDER_FAILED client payload (M6.5b #198)"
```

---

## Task 4 — Missing test cases for free-providers (Microsoft 403, Google null chunks, Microsoft empty auth)

**Files:**
- Modify: `apps/api/src/translate/__tests__/free-providers.test.ts`

**Background:** #198 item #5 lists three missing test cases. Adding them now while we're already in this file is cheap.

- [ ] **Step 4.1: Add Microsoft 403 → throws case**

```ts
it("Microsoft auth 403 surfaces as throwable error", async () => {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = typeof url === "string" ? url : url.toString()
    if (u.includes("/auth")) return new Response("forbidden", { status: 403 })
    throw new Error("should not reach translate endpoint")
  }) as unknown as typeof fetch

  await expect(microsoftTranslate("hi", "auto", "zh-Hans", fetchMock)).rejects.toThrow()
})
```

- [ ] **Step 4.2: Add Google null translatedText case**

```ts
it("Google translate handles null translatedText chunks gracefully", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify([[[null, "hi"], [null, "world"]]]), { status: 200 }),
  ) as unknown as typeof fetch

  const out = await googleTranslate("hi world", "auto", "zh-Hans", fetchMock)
  // Expect graceful empty-string fallback, no crash.
  expect(typeof out).toBe("string")
})
```

- [ ] **Step 4.3: Add Microsoft empty auth body case**

```ts
it("Microsoft auth empty body throws", async () => {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = typeof url === "string" ? url : url.toString()
    if (u.includes("/auth")) return new Response("", { status: 200 })
    throw new Error("should not reach")
  }) as unknown as typeof fetch

  await expect(microsoftTranslate("hi", "auto", "zh-Hans", fetchMock)).rejects.toThrow()
})
```

- [ ] **Step 4.4: Run tests**

```bash
pnpm --filter @getu/api test free-providers -- --run
```

Expected: All 3 new tests PASS (or, if they reveal bugs, add small implementation fixes — but flag in PR body).

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/translate/__tests__/free-providers.test.ts
git commit -m "test(api): cover Microsoft 403, Google null chunks, Microsoft empty auth (M6.5b #198)"
```

---

## Task 5 — Quota badge refresh after successful translate

**Files:**
- Modify: `apps/web/app/[locale]/translate/translate-client.tsx`
- Test: same orchestrator test file (assert callback invocation)

**Background:** After `translate.translate` succeeds, `QuotaBadge` still shows pre-translate count until next page load. Need to invalidate `billing.getEntitlements` query. #204 item #2.

- [ ] **Step 5.1: Identify entitlements fetch path**

```bash
grep -rn "billing.getEntitlements\|loadEntitlements" apps/web/app/[locale]/translate/
```

Confirm whether entitlements come from a TanStack Query, a Jotai atom, or a one-shot fetch in the page server component.

- [ ] **Step 5.2: Implement invalidation hook**

After the existing successful `setResults` in `handleTranslate` (Task 2 already extracted it), add:

```tsx
// translate-client.tsx — at the top
import { useQueryClient } from "@tanstack/react-query"
// inside component
const queryClient = useQueryClient()

// inside handleTranslate, after setResults:
if (results.some(r => "text" in r)) {
  queryClient.invalidateQueries({ queryKey: ["billing", "entitlements"] })
}
```

If the project uses Jotai instead of TanStack Query, replace with the equivalent atom refresh:

```tsx
import { useSetAtom } from "jotai"
import { entitlementsAtom } from "@/state/entitlements"
const refreshEntitlements = useSetAtom(entitlementsAtom)
// after setResults:
if (results.some(r => "text" in r)) await refreshEntitlements()
```

The exact path is determined by Step 5.1 — the executing agent must inspect the actual query/atom and pick the matching call.

- [ ] **Step 5.3: Add a unit test that asserts refresh callback fires after success**

Update the orchestrator test (or add a new lightweight test for `handleTranslate` mocked in isolation) to verify the post-success hook is invoked. If `handleTranslate` cannot be unit-tested without React Testing Library, fall back to: run the dev server, click Translate, observe network panel — record the manual verification in the PR body.

- [ ] **Step 5.4: Run tests + build**

```bash
pnpm --filter @getu/web test -- --run
pnpm --filter @getu/web build
```

Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/app/[locale]/translate/translate-client.tsx \
        apps/web/app/[locale]/translate/__tests__/translate-orchestrator.test.ts
git commit -m "fix(web): refresh quota badge after successful translate (M6.7 #204)"
```

---

## Task 6 — Open the PR

- [ ] **Step 6.1: Push branch**

```bash
git push -u origin feature/m6-followups
```

- [ ] **Step 6.2: Open PR**

```bash
gh pr create \
  --title "chore(translate): m6.5b/m6.7 high-priority follow-ups" \
  --body "$(cat <<'EOF'
## Summary

Bundles the HIGH-priority follow-ups from #198 (M6.5b) and #204 (M6.7) before starting M6.9 work.

- Closes #198 (HIGH items only — items #6/#7 deferred to M6.13)
- Partially addresses #204 (item #2; items #1/#3/#4 deferred to M6.13)

## Scope

- fix(api): Microsoft \`from\` param omitted for auto-detect (#198 #2)
- fix(web): AbortController cancels in-flight translate columns on unmount (#198 #3)
- chore(api): strip statusCode from PROVIDER_FAILED client payload (#198 #4)
- test(api): cover Microsoft 403, Google null chunks, Microsoft empty auth (#198 #5)
- fix(web): refresh quota badge after successful translate (#204 #2)

## Test Plan

- [ ] \`pnpm -r test\` green
- [ ] \`pnpm -r type-check\` green
- [ ] \`pnpm -r lint\` green
- [ ] Manual: Translate with auto-detect source — Microsoft column produces output
- [ ] Manual: Click Translate, immediately navigate away — no console errors

## Reviewer

[Filled by code-reviewer subagent]

## Codex review

[Filled by codex adversarial-review or marked as \`skipped after 5min timeout\`]
EOF
)"
```

- [ ] **Step 6.3: Watch CI + reviewer + codex; auto-merge on green**

```bash
# Wait for CI
gh pr checks --watch

# After CI green AND reviewer subagent approves AND codex review (or 5min timeout)
gh pr merge --auto --squash
```

---

## Self-review checklist (filled by author before opening PR)

- [ ] All 5 tasks committed individually
- [ ] No new dependencies added (test infra path uses lightweight orchestrator pattern)
- [ ] No formatter/linter warnings introduced
- [ ] Both deferred LOW lists (#198 #6/#7, #204 #1/#3/#4) recorded in M6.13 plan as carry-overs
