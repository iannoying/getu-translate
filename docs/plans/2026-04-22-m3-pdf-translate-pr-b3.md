# M3 · PR #B3 — D2 缓存 + 配额 + UpgradeDialog · 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Parent design:** `docs/plans/2026-04-21-m3-pdf-translate-pr-b-design.md`
> **Predecessors:** PR #B1 (#78, viewer foundation) → PR #B2 (#81, scheduler + progressive render)

**Goal:** Close the commercialization loop for PDF translation. Cache translations by content-based file fingerprint + page index with 30-day LRU. Enforce Free-tier quota (50 pages/day, Q2 count-on-success) via `useProGuard('pdf_translate_unlimited')`. Hard-stop scheduler when the 51st fresh page completes; UpgradeDialog pops. Pro users bypass both limits; cache-hit pages don't consume quota.

**Architecture:** Two Dexie tables (`pdfTranslations` cache + `pdfTranslationUsage` daily counter). Scheduler's injected `translate` wraps the existing `translateSegment` with a cache-check-then-fetch-then-store pattern. Daily counter increments only when the LAST paragraph of a page lands, not per paragraph. `useProGuard` integration lives in `main.ts` — before enqueuing new pages, check entitlement; if 51st exceeds limit, `scheduler.abort()` + open UpgradeDialog. Switches `fingerprintForSrc` from sync SHA-of-URL to async content-hash (fetch bytes → `crypto.subtle.digest`).

**Tech Stack:** Dexie 4.x · `@getu/contract` billing entitlements · existing M2 `useProGuard` + UpgradeDialog · `crypto.subtle.digest` for content hashing · `browser.alarms` for LRU eviction

---

## Preconditions

- Worktree: `.claude/worktrees/m3-pdf-translate-core-b3`, branch `feat/m3-pdf-translate-b3`
- Based on `feat/m3-pdf-translate-b2` (PR #81). After #78+#81 merge, rebase onto main.
- Baseline: 1288 passing (PR #B2 HEAD)
- Prior art to read:
  - `apps/extension/src/utils/db/dexie/input-translation-usage.ts` — daily counter template
  - `apps/extension/src/utils/db/dexie/__tests__/input-translation-usage.test.ts` — test pattern
  - `apps/extension/src/hooks/use-pro-guard.ts` — entitlement gate hook
  - `apps/extension/src/entrypoints/selection.content/input-translation/quota/use-input-quota.ts` — M2 quota integration

## Delivery

Single PR #B3. 6 tasks + changeset + merge-gate review. Stacked on PR #81.

---

## Task 1: `pdfTranslations` cache Dexie table

**Goal:** Cache translated paragraph text, keyed by `(fileHash, pageIndex)`, with LRU eviction metadata.

**Files:**
- Modify `apps/extension/src/utils/db/dexie/app-db.ts` — add `pdfTranslations` table to the Dexie schema
- Create `apps/extension/src/utils/db/dexie/pdf-translations.ts` — CRUD helpers
- Create `apps/extension/src/utils/db/dexie/__tests__/pdf-translations.test.ts`

**Schema (following design doc):**

```ts
export interface PdfTranslationRow {
  id: string                      // `${fileHash}:${pageIndex}`, primary key
  fileHash: string                // indexed
  pageIndex: number
  targetLang: string              // cache is language-scoped
  providerId: string              // cache is provider-scoped
  paragraphs: Array<{
    srcHash: string               // SHA-256 of source text (detect paragraph-level cache invalidation)
    translation: string
  }>
  createdAt: number               // indexed
  lastAccessedAt: number          // indexed for LRU
}
```

**Migration:** increment DB version by 1; `db.version(n).stores({ pdfTranslations: "id, fileHash, createdAt, lastAccessedAt" })`. No migration function needed (new table, no historical data).

**API:**

```ts
export async function getCachedPage(
  fileHash: string,
  pageIndex: number,
  targetLang: string,
  providerId: string,
): Promise<PdfTranslationRow | null>

export async function putCachedPage(row: Omit<PdfTranslationRow, "lastAccessedAt">): Promise<void>

export async function touchCachedPage(fileHash: string, pageIndex: number): Promise<void>

export async function evictExpired(ttlMs: number, now: number = Date.now()): Promise<number>
```

Cache key includes `targetLang + providerId` so switching config invalidates correctly. `touchCachedPage` updates `lastAccessedAt` on cache hit.

**Tests (≥ 6):**
- put + get round-trip
- cache miss returns null
- different targetLang/providerId → separate cache entries
- `evictExpired` deletes rows where `now - lastAccessedAt > ttlMs`
- `evictExpired` preserves fresh rows
- `touchCachedPage` updates lastAccessedAt

**Commit:** `feat(db): add pdfTranslations cache table (M3 PR#B3 Task 1)`

---

## Task 2: `pdfTranslationUsage` daily counter

**Goal:** Daily count of pages successfully translated. Mirror `inputTranslationUsage` exactly.

**Files:**
- Create `apps/extension/src/utils/db/dexie/pdf-translation-usage.ts`
- Create `apps/extension/src/utils/db/dexie/__tests__/pdf-translation-usage.test.ts`
- Modify `app-db.ts` to register the table

**Schema:**

```ts
export interface PdfTranslationUsageRow {
  dateKey: string         // "YYYY-MM-DD" in local timezone
  count: number
}
```

**API (mirror M2):**

```ts
export async function incrementPdfPageUsage(now?: Date): Promise<number>
export async function getPdfPageUsage(now?: Date): Promise<number>
export function pdfPageUsageDateKey(now: Date): string  // helper, extracted for testability
```

**Tests (≥ 4, same shape as M2):**
- Increments counter for today
- Separates counters per day (boundary test across local midnight)
- Returns 0 when no row for today
- Idempotency-safe: 100 increments in parallel → count === 100

**Commit:** `feat(db): add pdfTranslationUsage daily counter (M3 PR#B3 Task 2)`

---

## Task 3: `usePdfTranslationQuota` hook

**Goal:** React hook returning Free-or-Pro quota state, mirroring `useInputTranslationQuota` structure.

**Files:**
- Create `apps/extension/src/entrypoints/pdf-viewer/quota/use-pdf-quota.ts`
- Create `apps/extension/src/entrypoints/pdf-viewer/quota/__tests__/use-pdf-quota.test.tsx`
- Create `packages/definitions/src/pdf/constants.ts` — `FREE_PDF_PAGES_PER_DAY = 50`

**API:**

```ts
export interface PdfQuotaState {
  isLoading: boolean
  used: number
  limit: number | "unlimited"
  canTranslatePage: boolean
  /** Increment counter on successful page. Returns new used count. */
  recordPageSuccess: () => Promise<number>
}

export function usePdfTranslationQuota(): PdfQuotaState
```

Internally:
- Dexie liveQuery on `getPdfPageUsage()` for reactive `used`
- `hasFeature(entitlements, "pdf_translate_unlimited")` determines `limit: "unlimited"` vs `50`
- `canTranslatePage = !isLoading && (limit === "unlimited" || used < limit)`
- `recordPageSuccess` calls `incrementPdfPageUsage()` and returns the new count

**Tests (≥ 5):**
- Free, used=0 → canTranslatePage=true
- Free, used=49 → canTranslatePage=true
- Free, used=50 → canTranslatePage=false
- Pro → `limit === "unlimited"`, canTranslatePage always true
- `recordPageSuccess` increments counter

**Commit:** `feat(pdf-viewer): add usePdfTranslationQuota hook (M3 PR#B3 Task 3)`

---

## Task 4: Scheduler — cache-first lookup + cache write

**Goal:** Wrap `translateSegment` with cache-check and cache-write. Scheduler's `translate` dep now:
1. On enqueue: check cache for this paragraph's source text + config
2. If hit: `setStatus(key, { kind: "done", translation })` immediately + `touchCachedPage`
3. If miss: call real provider → on success, store in cache + set status

**Files:**
- Create `apps/extension/src/entrypoints/pdf-viewer/translation/cached-translate.ts` — composable wrapper
- Create `apps/extension/src/entrypoints/pdf-viewer/translation/__tests__/cached-translate.test.ts`
- Modify `pdf-viewer/main.ts` — wire the cached wrapper when constructing the scheduler

**Design:**

```ts
// cached-translate.ts
export function createCachedTranslate(deps: {
  fileHash: string
  pageIndex: number                       // caller knows which page this paragraph belongs to
  paragraphIndex: number
  targetLang: string
  providerId: string
  sourceText: string
  upstream: (text: string) => Promise<string>   // real translateSegment
}): Promise<string>
```

Actually the API is simpler if we think about it page-granularly. Cache is keyed per-page; within a page, all paragraph translations are stored together. The scheduler works paragraph-granularly, so we need a batching layer:

- On mount, `PageTranslationBatch` object is created per page with all paragraphs
- Scheduler calls the wrapper; wrapper's logic:
  - First paragraph of a page: check cache → if entire page cached, fan out all paragraph results immediately + touch + return
  - Otherwise: call upstream for each paragraph, collect results, write whole page to cache when the last paragraph completes
- This requires the wrapper to track per-page completion state

Rework: keep the scheduler paragraph-granular. Cache is per-page. Introduce `PageCacheCoordinator`:
- One coordinator per page
- Before scheduler enqueues paragraphs for a page, coordinator checks cache
- Cache hit: coordinator directly sets status for all paragraphs; doesn't enqueue
- Cache miss: coordinator lets enqueue proceed; listens for all paragraph completions; writes full-page cache row when done

This is cleaner. Files:
- `translation/page-cache-coordinator.ts` — orchestrates cache check / write per page
- `translation/__tests__/page-cache-coordinator.test.ts`
- `main.ts` — in `mountOverlayForPage`, call coordinator.start() instead of directly enqueuing

**Tests:**
- Cache hit: no upstream calls, all statuses go to `done` immediately
- Cache miss: all paragraphs enqueued via scheduler; when last completes, cache row written
- Partial failure: some paragraphs error, don't cache (only write full-page on full success)

**Commit:** `feat(pdf-viewer): cache-first page translation + write-on-success (M3 PR#B3 Task 4)`

---

## Task 5: Quota integration — hard-stop + UpgradeDialog

**Goal:** Before enqueuing new pages, check quota. When 51st fresh page success would exceed limit, `scheduler.abort()` + open UpgradeDialog. Cache hits don't count.

**Files:**
- Modify `main.ts`:
  - Read `usePdfTranslationQuota` (via store or direct imports — pdf-viewer has Jotai Provider from B2)
  - On page success (from coordinator): `quota.recordPageSuccess()` + check new count; if exceeds, `scheduler.abort()` + set a `quotaExhausted` flag
  - In `mountOverlayForPage`: before enqueuing, check `quota.canTranslatePage`; if false and not cached, skip enqueue + show UpgradeDialog
  - Wire UpgradeDialog mount (copy from M2 input-translation pattern)
- Modify `main.ts` — import `UpgradeDialog` component + show it on quota exhaustion

**UX behavior:**
- Free user opens 80-page PDF with `activationMode="always"`: first 50 pages translate fine; 51st page trigger stops scheduler + opens dialog
- Already-rendered pages 1-50 stay visible (don't reset)
- User clicks Upgrade → redirects to purchase flow (M2's dialog handles this)
- User dismisses dialog → pages 51-80 stay as `[...]` placeholders
- Re-opening same file: D2 cache means pages 1-50 come from cache instantly, no quota consumed; pages 51-80 still show toast/error

**Tests:**
- Integration-ish: mock scheduler + quota, simulate 51st completion → abort called + dialog opened flag
- Cache-hit page doesn't decrement quota
- Pro user: never hits the limit

**Commit:** `feat(pdf-viewer): enforce free-tier quota with upgrade prompt (M3 PR#B3 Task 5)`

---

## Task 6: Async content-based fingerprint + LRU eviction alarm

**Goal:** Replace sync `fingerprintForSrc(src: string): string` with async content-based hash. Register daily LRU eviction for the cache table.

**Files:**
- Modify `apps/extension/src/utils/pdf/fingerprint.ts`:
  - Export async `fingerprintForPdf(src: string): Promise<string>` that fetches bytes + `crypto.subtle.digest("SHA-256", bytes)`
  - Keep old sync export? No — caller updates are trivial. Rename; if any other caller exists, update.
- Modify `main.ts` — `const fileHash = await fingerprintForPdf(src)` becomes awaited
- Create or modify `apps/extension/src/entrypoints/background/db-cleanup.ts` — add `pdf-translations-cleanup` alarm that calls `evictExpired(30 * 24 * 60 * 60 * 1000)` daily
- Update fingerprint tests: now async

**Handling failures:** if `fetch(src)` fails (network error, CORS), fall back to sync hash of the src URL with a warning. Cache keyed by URL hash is worse but not wrong — just less dedup-capable.

**Tests:**
- fingerprintForPdf with mocked fetch returning fixed bytes → deterministic hex hash
- Fetch failure → fallback to URL hash
- 30-day eviction removes old entries, keeps fresh ones (already in Task 1 but re-run as integration test)

**Commit:** `feat(pdf-viewer): content-based file fingerprint + daily cache eviction (M3 PR#B3 Task 6)`

---

## Task 7: Changeset + PR

**Files:**
- Create `.changeset/m3-pdf-b3-cache-quota.md`

```md
---
"@getu/extension": patch
---

feat: M3 PR#B3 — PDF translation cache + quota + UpgradeDialog

- `pdfTranslations` Dexie table (per-file × per-page × per-config), 30-day LRU eviction
- `pdfTranslationUsage` daily counter (mirrors M2 input-translation pattern)
- `usePdfTranslationQuota` hook enforcing Free 50 pages/day (Q2 count-on-success)
- `PageCacheCoordinator` — cache-first lookup; full-page cache write on success
- Hard-stop on 51st fresh page: scheduler aborts, `UpgradeDialog` pops; already-translated pages remain visible
- Pro users with `pdf_translate_unlimited` bypass the limit
- Content-based file fingerprint (SHA-256 of PDF bytes), falls back to URL hash on fetch failure
- Daily cache eviction via `browser.alarms`
```

**Final verification:**
```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test
pnpm --filter @getu/extension type-check
pnpm --filter @getu/extension lint
pnpm --filter @getu/extension build
```

**Push + PR:**
- Base branch: `feat/m3-pdf-translate-b2` (stacked until #81 merges)
- Title: `feat(pdf): M3 PR#B3 — cache + quota + upgrade prompt`

---

## PR #B3 验收标准

- [ ] Tasks 1–7 each its own commit
- [ ] New tests ≥ 25 (cache 6, usage 4, quota hook 5, cached-translate / coordinator 5+, fingerprint 3+, quota integration 2)
- [ ] `SKIP_FREE_API=true pnpm test && type-check && lint` green
- [ ] Manual smoke:
  - Free account on 80-page PDF: pages 1-50 translate; 51st triggers UpgradeDialog
  - Re-open same PDF: all pages from cache, 0 quota consumed
  - Pro account on 200-page PDF: all 200 pages translate
  - Switching target lang: fresh translations (cache key miss)
  - Clear cache button in options: cache cleared, next open re-translates
- [ ] `codex:adversarial-review` merge-gate review

## 出 scope (PR #C)

- Pro export to bilingual PDF via `pdf-lib`
- Watermark for Free tier
- Options → PDF cache management UI (view usage, clear cache button)
- i18n of all new B3 strings (UpgradeDialog already i18n'd; new error strings need it)

## 风险 + 回退

| 风险 | 缓解 |
|------|------|
| `crypto.subtle.digest` not available in some MV3 contexts | Fall back to URL hash; fingerprint.ts guards the branch |
| Cache row size grows unbounded per file | 30-day LRU + daily alarm; user-triggered clear via options (PR #C) |
| Per-paragraph srcHash mismatch after OCR or PDF update | Page-granular cache invalidation: if any paragraph's srcHash differs, treat entire page as miss |
| UpgradeDialog flash on paginated loads | Debounce: only show dialog once per session per quota exhaustion event |
| Scheduler.abort() interrupts mid-page | Coordinator catches the abort; page stays in mixed done/error state — acceptable for MVP |
