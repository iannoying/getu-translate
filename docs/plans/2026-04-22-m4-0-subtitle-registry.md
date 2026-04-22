# M4.0 · SubtitleAdapter Registry — refactor · 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> **Parent design:** `docs/plans/2026-04-22-m4-video-subtitles-design.md`

**Goal:** Zero-behavior-change refactor that extracts a `PlatformRegistry` from `runtime.ts`, making it trivial for subsequent PRs (M4.1 Bilibili, M4.2 TED, M4.3 X) to register new platforms by adding a single entry + an `init-*-subtitles.ts` module.

**Architecture:** A registry is a list of `PlatformHandler`s, each `{ hostnameMatcher: RegExp, init: () => void }`. `runtime.ts` iterates the registry on bootstrap, finds the first matching entry by `window.location.hostname`, and calls its `init()`. YouTube stays exactly as it is — it just becomes the first entry in the registry instead of a hardcoded call.

**Tech Stack:** Plain TS. No new deps.

---

## Preconditions

- Worktree: `.claude/worktrees/m4-refactor`, branch `feat/m4-0-subtitle-refactor`
- Based on `origin/main` (after design PR #102)
- Baseline: current main tests passing

## Scope

4 small tasks + changeset. All file-scoped changes. ~150-200 LOC.

---

## Task 1: Platform registry module

**Files:**
- Create `apps/extension/src/entrypoints/subtitles.content/platforms/registry.ts`
- Create `apps/extension/src/entrypoints/subtitles.content/platforms/__tests__/registry.test.ts`

**Shape:**

```ts
// platforms/registry.ts
export interface PlatformHandler {
  /** Stable identifier, used in logging + telemetry */
  readonly kind: string
  /** Test if this handler should claim the current page */
  matches(hostname: string): boolean
  /** Initialize the platform-specific subtitle pipeline */
  init(): void
}

export interface PlatformRegistry {
  register(handler: PlatformHandler): void
  dispatch(hostname: string): PlatformHandler | null
  /** For tests */
  list(): readonly PlatformHandler[]
}

export function createPlatformRegistry(): PlatformRegistry {
  const handlers: PlatformHandler[] = []
  return {
    register(h) { handlers.push(h) },
    dispatch(hostname) {
      return handlers.find(h => h.matches(hostname)) ?? null
    },
    list() { return handlers },
  }
}
```

**Tests (≥ 4):**
- `register` + `list` round-trip
- `dispatch` finds first matching handler
- `dispatch` returns null when no match
- First-match wins (registration order) — two handlers matching same hostname → first registered wins

**Commit:** `feat(subtitles): add PlatformRegistry abstraction (M4.0)`

---

## Task 2: Wrap YouTube into a PlatformHandler entry

**Files:**
- Create `apps/extension/src/entrypoints/subtitles.content/platforms/youtube/handler.ts` — exports `youtubeHandler: PlatformHandler` that wraps the existing `initYoutubeSubtitles` and matches `*.youtube.com`
- Test: add to `__tests__/registry.test.ts` — registering youtubeHandler + dispatching `www.youtube.com` yields it

**Shape:**

```ts
// platforms/youtube/handler.ts
import { initYoutubeSubtitles } from "../../init-youtube-subtitles"
import type { PlatformHandler } from "../registry"

export const youtubeHandler: PlatformHandler = {
  kind: "youtube",
  matches: (hostname) => /\.youtube\.com$/.test(hostname) || hostname === "youtube.com",
  init: initYoutubeSubtitles,
}
```

No change to `init-youtube-subtitles.ts` itself.

**Commit:** `feat(subtitles): wrap youtube as PlatformHandler (M4.0)`

---

## Task 3: Switch runtime.ts to registry dispatch

**Files:**
- Modify `apps/extension/src/entrypoints/subtitles.content/runtime.ts`

**New shape:**

```ts
import { createPlatformRegistry } from "./platforms/registry"
import { youtubeHandler } from "./platforms/youtube/handler"

const registry = createPlatformRegistry()
registry.register(youtubeHandler)
// Future PRs register bilibiliHandler, tedHandler, xHandler here

let hasBootstrappedSubtitlesRuntime = false

export function bootstrapSubtitlesRuntime() {
  if (hasBootstrappedSubtitlesRuntime) return
  hasBootstrappedSubtitlesRuntime = true

  const handler = registry.dispatch(window.location.hostname)
  if (!handler) return   // no platform matches — no-op
  handler.init()
}

// Export registry for tests + future PR platform registrations
export { registry as subtitlesPlatformRegistry }
```

**Tests:**
- Existing `universal-adapter.test.ts` + YouTube-facing integration tests should pass unchanged — the dispatch layer is transparent for a single-platform setup.

**Commit:** `refactor(subtitles): dispatch via registry instead of hardcoded youtube init (M4.0)`

---

## Task 4: Changeset + PR

**Files:**
- Create `.changeset/m4-0-subtitle-registry.md`:

```md
---
"@getu/extension": patch
---

refactor(subtitles): extract PlatformRegistry for multi-platform dispatch

Zero-behavior-change refactor that introduces a `PlatformRegistry` in the
subtitles content script. YouTube is now registered as one platform handler
instead of being hardcoded into `runtime.ts`. Subsequent PRs (M4.1 Bilibili,
M4.2 TED, M4.3 X) will each register their own handler — no further runtime
changes needed.
```

**Verify:**
```bash
cd apps/extension
SKIP_FREE_API=true pnpm exec vitest run 2>&1 | tail -5
pnpm exec tsc --noEmit
pnpm exec eslint src
```

Expect test count identical or +4-5 from new registry tests.

**Push + PR** against `main`.

---

## Acceptance

- [ ] 4 commits (1 per task, or 3 per task + 1 changeset)
- [ ] Test delta: +4 to +8 new tests (registry + youtube handler coverage)
- [ ] Full suite passes; type-check + lint clean
- [ ] YouTube subtitle translation manually verified no regression (smoke test on any YouTube video with CC)
- [ ] PR body references this plan + design doc

## Out of scope (later PRs)

- M4.1 Bilibili adapter
- M4.2 TED adapter
- M4.3 X adapter
- manifest host_permissions additions (per-platform PR adds its own)
