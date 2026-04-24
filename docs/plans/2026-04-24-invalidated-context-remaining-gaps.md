# Invalidated Extension Context — Remaining Gap Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the three remaining unhandled-promise rejection paths that survived the initial atom-onMount fix so `Uncaught (in promise) Error: Extension context invalidated.` no longer appears in content-script logs.

**Architecture:** The prior fix already covers fire-and-forget reads in Jotai atom `onMount` handlers via [apps/extension/src/utils/atoms/storage-adapter.ts](apps/extension/src/utils/atoms/storage-adapter.ts) helper `swallowInvalidatedStorageRead`. This plan extends the same pattern to three remaining paths:
1. `writeConfigAtom`'s catch block re-throws after rollback — unhandled when caller is fire-and-forget.
2. `host.content/runtime.ts` `handleUrlChange` + two `void sendMessage(...)` calls lack catches and run on every SPA navigation.
3. Add JSDoc + unit tests for the shared helper (reviewer item #4, #5).

**Tech Stack:** TypeScript, Vitest, WXT, Jotai.

---

## Task 1: Silence invalidated-context rejections in `writeConfigAtom`

**Why:** `writeConfigAtom` (`config.ts:86`) currently does `throw error` after rollback. When an event handler fires `void set(writeConfigAtom, patch)` without awaiting, an "Extension context invalidated" rejection becomes Uncaught. Other write atoms (`themeModeAtom`, `detectedCodeAtom`, `analyticsEnabledAtom`) do NOT re-throw and are already safe — only `writeConfigAtom` needs this change.

**Files:**
- Modify: [apps/extension/src/utils/atoms/config.ts:78-87](apps/extension/src/utils/atoms/config.ts:78)

**Step 1: Add unit test for the new behavior**

Create `apps/extension/src/utils/atoms/__tests__/config.test.ts` (or append to an existing test file if one exists — run `ls apps/extension/src/utils/atoms/__tests__/` first). Minimal test:

```ts
import { createStore } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { configAtom, writeConfigAtom } from "../config"
import { storageAdapter } from "../storage-adapter"

describe("writeConfigAtom invalidated-context handling", () => {
  afterEach(() => vi.restoreAllMocks())

  it("does not re-throw when storage.set rejects with 'Extension context invalidated'", async () => {
    vi.spyOn(storageAdapter, "get").mockResolvedValue({} as any)
    vi.spyOn(storageAdapter, "set").mockRejectedValue(
      new Error("Extension context invalidated."),
    )

    const store = createStore()
    // @ts-expect-error — partial patch is fine for this smoke test
    await expect(store.set(writeConfigAtom, { language: {} })).resolves.toBeUndefined()
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
cd apps/extension && pnpm test src/utils/atoms/__tests__/config.test.ts
```
Expected: FAIL — current code throws.

**Step 3: Modify the catch block**

Replace lines 78–87 in [apps/extension/src/utils/atoms/config.ts](apps/extension/src/utils/atoms/config.ts):

```ts
      catch (error) {
        if (!isExtensionContextInvalidatedError(error)) {
          console.error("Failed to set config to storage:", nextToPersist, error)
        }

        // Roll back to storage value on error, but only if we're still the latest write.
        if (currentWriteVersion === writeVersion) {
          set(configAtom, configInStorage)
        }

        if (isExtensionContextInvalidatedError(error)) {
          return
        }
        throw error
      }
```

Update import:
```ts
import { isExtensionContextInvalidatedError, storageAdapter, swallowInvalidatedStorageRead } from "./storage-adapter"
```

**Step 4: Run the test to verify it passes**

```bash
cd apps/extension && pnpm test src/utils/atoms/__tests__/config.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/utils/atoms/config.ts apps/extension/src/utils/atoms/__tests__/config.test.ts
git commit -m "fix(extension): swallow invalidated-context rejection in writeConfigAtom"
```

---

## Task 2: Silence invalidated-context rejections in host.content URL-change handler

**Why:** `setupUrlChangeListener` in [listen.ts](apps/extension/src/entrypoints/host.content/listen.ts) fires `extension:URLChange` on every SPA nav. `handleExtensionUrlChange` in [runtime.ts:67-70](apps/extension/src/entrypoints/host.content/runtime.ts:67) fire-and-forgets `handleUrlChange` which then awaits `storage.setItem` and `sendMessage` — both throw after invalidation. The stack trace `at document.addEventListener.signal (host.js:349:...)` points here. Additionally, the two `void sendMessage("checkAndAskAutoPageTranslation", ...)` calls at lines 62 and 100 have no catch.

**Files:**
- Modify: [apps/extension/src/entrypoints/host.content/runtime.ts:50-70](apps/extension/src/entrypoints/host.content/runtime.ts:50) and `runtime.ts:94-101`

**Step 1: Add helper usage via try/catch inside `handleUrlChange`**

Replace `handleUrlChange` (lines 50–65):

```ts
  const handleUrlChange = async (from: string, to: string) => {
    if (from === to) {
      return
    }
    logger.info("URL changed from", from, "to", to)
    if (manager.isActive) {
      manager.stop()
    }
    // Only the top frame should detect and set language to avoid race conditions from iframes
    if (window !== window.top) {
      return
    }
    try {
      const { detectedCodeOrUnd } = await getDocumentInfo()
      const detectedCode: LangCodeISO6393 = detectedCodeOrUnd === "und" ? "eng" : detectedCodeOrUnd
      await storage.setItem<LangCodeISO6393>(`local:${DETECTED_CODE_STORAGE_KEY}`, detectedCode)
      await sendMessage("checkAndAskAutoPageTranslation", { url: to, detectedCodeOrUnd })
    }
    catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        logger.error("Failed to handle URL change:", error)
      }
    }
  }
```

Notes:
- Flatten the early-return for cleaner try-scope.
- Replace `void sendMessage(...)` (was line 62) with `await sendMessage(...)` inside the try — the surrounding try/catch now handles both.

**Step 2: Wrap the initial-load sendMessage at line 94-101 similarly**

Replace the bottom block:

```ts
  // Only the top frame should detect and set language to avoid race conditions from iframes
  if (window === window.top) {
    try {
      const { detectedCodeOrUnd } = await getDocumentInfo()
      const initialDetectedCode: LangCodeISO6393 = detectedCodeOrUnd === "und" ? "eng" : detectedCodeOrUnd
      await storage.setItem<LangCodeISO6393>(`local:${DETECTED_CODE_STORAGE_KEY}`, initialDetectedCode)
      await sendMessage("checkAndAskAutoPageTranslation", { url: window.location.href, detectedCodeOrUnd })
    }
    catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        logger.error("Failed to handle initial URL change:", error)
      }
    }
  }
```

**Step 3: Add import for the helper**

Add to the imports section of [runtime.ts](apps/extension/src/entrypoints/host.content/runtime.ts):

```ts
import { isExtensionContextInvalidatedError } from "@/utils/atoms/storage-adapter"
```

**Step 4: Type-check**

```bash
cd apps/extension && pnpm exec tsc --noEmit
```
Expected: exit 0.

**Step 5: Run existing host.content tests**

```bash
cd apps/extension && pnpm test src/entrypoints/host.content
```
Expected: all pass (no new tests required; tests already cover happy path).

**Step 6: Commit**

```bash
git add apps/extension/src/entrypoints/host.content/runtime.ts
git commit -m "fix(extension): swallow invalidated-context rejection in host URL-change handler"
```

---

## Task 3: JSDoc + unit tests for the shared helper

**Why:** Reviewer items #4 and #5 — the helper silently swallows errors based on string match; a unit test locks in browser-string compatibility and a JSDoc tells future maintainers why the string approach was chosen.

**Files:**
- Modify: [apps/extension/src/utils/atoms/storage-adapter.ts](apps/extension/src/utils/atoms/storage-adapter.ts)
- Create: `apps/extension/src/utils/atoms/__tests__/storage-adapter.test.ts`

**Step 1: Write failing tests**

Create `apps/extension/src/utils/atoms/__tests__/storage-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import {
  isExtensionContextInvalidatedError,
  swallowInvalidatedStorageRead,
} from "../storage-adapter"

describe("isExtensionContextInvalidatedError", () => {
  it("returns true for the canonical Chrome/Firefox error message", () => {
    expect(isExtensionContextInvalidatedError(new Error("Extension context invalidated."))).toBe(true)
  })

  it("returns true when the message contains the phrase with extra text", () => {
    expect(isExtensionContextInvalidatedError(new Error("chrome.storage: Extension context invalidated while reading"))).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(isExtensionContextInvalidatedError(new Error("Something else"))).toBe(false)
  })

  it("returns false for non-Error values", () => {
    expect(isExtensionContextInvalidatedError("Extension context invalidated.")).toBe(false)
    expect(isExtensionContextInvalidatedError(null)).toBe(false)
    expect(isExtensionContextInvalidatedError(undefined)).toBe(false)
  })
})

describe("swallowInvalidatedStorageRead", () => {
  it("silently swallows invalidated-context errors", () => {
    const handler = swallowInvalidatedStorageRead("testAtom")
    expect(() => handler(new Error("Extension context invalidated."))).not.toThrow()
  })

  it("logs non-invalidation errors via logger.error", async () => {
    const loggerModule = await import("@/utils/logger")
    const spy = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {})

    const handler = swallowInvalidatedStorageRead("testAtom")
    handler(new Error("some real failure"))

    expect(spy).toHaveBeenCalledWith("testAtom storage read failed:", expect.any(Error))
    spy.mockRestore()
  })
})
```

**Step 2: Run tests to verify they fail or pass accordingly**

```bash
cd apps/extension && pnpm test src/utils/atoms/__tests__/storage-adapter.test.ts
```
Expected: ALL PASS (the helper already exists and matches spec). If any fail, tighten helper or test to match.

**Step 3: Add JSDoc to helpers**

In [apps/extension/src/utils/atoms/storage-adapter.ts](apps/extension/src/utils/atoms/storage-adapter.ts), replace the existing comments with JSDoc:

```ts
/**
 * Detects the "Extension context invalidated." error thrown by `chrome.runtime` /
 * `chrome.storage` / `browser.*` APIs after the extension is reloaded or updated
 * while a content script is still running.
 *
 * Uses message-substring match because neither Chromium nor Firefox exposes a
 * standard error subclass for this case. Verified against Chromium-based browsers
 * (Chrome, Edge, Arc) and Firefox — all emit the same canonical phrasing. Update
 * the match if a future browser diverges.
 */
export function isExtensionContextInvalidatedError(error: unknown): boolean {
  return (
    error instanceof Error
    && error.message.includes("Extension context invalidated")
  )
}

/**
 * Returns a `.catch` handler suitable for fire-and-forget storage reads on
 * content-script lifecycle boundaries (atom `onMount`, visibility change).
 * Silently swallows errors triggered by extension reload; logs real failures
 * through the shared logger so they remain visible during development.
 *
 * @param context Human-readable identifier shown in logs (e.g. `"configAtom initial"`).
 */
export function swallowInvalidatedStorageRead(context: string) {
  return (error: unknown) => {
    if (isExtensionContextInvalidatedError(error)) {
      return
    }
    logger.error(`${context} storage read failed:`, error)
  }
}
```

**Step 4: Re-run the helper tests**

```bash
cd apps/extension && pnpm test src/utils/atoms/__tests__/storage-adapter.test.ts
```
Expected: ALL PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/utils/atoms/storage-adapter.ts apps/extension/src/utils/atoms/__tests__/storage-adapter.test.ts
git commit -m "test(extension): add unit tests and JSDoc for invalidated-context helper"
```

---

## Final Verification

**Step 1: Full type-check**

```bash
cd apps/extension && pnpm exec tsc --noEmit
```
Expected: exit 0.

**Step 2: Full test suite for touched areas**

```bash
cd apps/extension && pnpm test src/utils/atoms src/entrypoints/host.content
```
Expected: all pass.

**Step 3: Manual smoke (optional, needs Chrome)**

1. `cd apps/extension && pnpm dev` to build in dev mode.
2. Load the extension in Chrome.
3. Open a long-lived tab (e.g., GitHub PRs page).
4. Reload the extension from `chrome://extensions`.
5. Switch back to the tab and navigate in-page (click a link); confirm DevTools console stays free of `Uncaught (in promise) Error: Extension context invalidated.`.

---

## Out of Scope (Reviewer Items Not Addressed)

- **`storageAdapter.watch` callback path** — Chrome/Firefox stop delivering `storage.onChanged` after invalidation, so the listener cannot fire. No wrap needed; document in AGENTS.md if future contributors question it.
- **Migrating `console.error` → `logger.error` in write atoms** — tracked separately; purely cosmetic.
- **`last-sync-time.ts` missing `visibilitychange` handler** — intentional by design; sync time is non-critical.
- **Pushing the catch into `storageAdapter.get` itself** — keeps the adapter neutral for `writeConfigAtom`'s read path which relies on error propagation; explicit per-call-site context strings aid debugging.
