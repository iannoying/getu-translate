import type { Paragraph } from "./paragraph/types"
import type { SegmentKey } from "./translation/atoms"
import type { EnqueuePolicy } from "./translation/enqueue-policy"
import type { PdfQuotaGate } from "./translation/pdf-quota-gate"
import { FREE_PDF_PAGES_PER_DAY } from "@getu/definitions"
import { createStore } from "jotai"
import { hasFeature, isPro } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { addDomainToBlocklistAtom } from "@/utils/atoms/pdf-translation"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  getPdfPageUsage,
  incrementPdfPageUsage,
} from "@/utils/db/dexie/pdf-translation-usage"
import {
  getCachedPage,
  putCachedPage,
  touchCachedPage,
} from "@/utils/db/dexie/pdf-translations"
import { fingerprintForPdf } from "@/utils/pdf/fingerprint"
import { showPdfUpgradeDialogAtom } from "./atoms"
import { parseSrcParam } from "./parse-src-param"
import { segmentStatusAtomFamily } from "./translation/atoms"
import { decideInitialPolicy } from "./translation/enqueue-policy"
import { PageCacheCoordinator } from "./translation/page-cache-coordinator"
import { parseSegmentKey } from "./translation/parse-segment-key"
import { createPdfQuotaGate } from "./translation/pdf-quota-gate"
import { TranslationScheduler } from "./translation/scheduler"
import { translateSegment } from "./translation/translate-segment"
import "pdfjs-dist/web/pdf_viewer.css"
import "./style.css"

/**
 * Module-scoped Jotai store shared by every React root this entrypoint mounts
 * (per-page overlay roots + the first-use toast root). Using one store means
 * the translation scheduler (PR #B2 Task 3) and any React subscribers observe
 * the same atom values across page-level roots, and writes from plain
 * callbacks (e.g. the toast's "Never on this site" handler) can go through
 * `pdfViewerStore.set(atom, value)` instead of reading / writing storage
 * directly.
 */
export const pdfViewerStore = createStore()

/**
 * Mutable reference to the current file's scheduler. `boot()` sets it after
 * instantiation so later hooks (PR #B2 Task 5 toast-accept wiring) can reach
 * the scheduler without threading it through a closure. Exported for tests.
 */
export const schedulerRef: { current: TranslationScheduler | null } = {
  current: null,
}

/**
 * Mutable reference to the current file's page-level cache coordinator
 * (PR #B3 Task 4). One coordinator per file, same lifetime as the scheduler.
 * Exported for tests and for PR #B3 Task 5 to wire quota enforcement onto
 * `onPageSuccess`.
 */
export const coordinatorRef: { current: PageCacheCoordinator | null } = {
  current: null,
}

/**
 * Mutable reference to the current file's quota gate (PR #B3 Task 5). Pure
 * imperative wrapper around entitlements + Dexie page counter; consulted by
 * `mountOverlayForPage` before enqueuing a new page and incremented on every
 * fresh-page success from the coordinator. Exported for tests.
 */
export const quotaGateRef: { current: PdfQuotaGate | null } = {
  current: null,
}

/**
 * Sticky "free-tier exhausted" flag for the current file (PR #B3 Task 5).
 * Flipped to `true` once the coordinator reports a fresh-page success that
 * lands the user at or over `FREE_PDF_PAGES_PER_DAY`. While `true`:
 *   - `mountOverlayForPage` skips enqueuing additional fresh pages.
 *   - The UpgradeDialog stays openable (user can dismiss + reopen).
 * Reset to `false` on every new `boot()` — a fresh file open gives Free users
 * another chance if their counter has since rolled over.
 */
export const quotaExhaustedRef: { current: boolean } = {
  current: false,
}

/**
 * Mutable enqueue policy for the current file. Starts as decided by
 * `decideInitialPolicy(activationMode)` and flips to `"enabled"` when the
 * first-use toast's Accept button is clicked (PR #B2 Task 5). All
 * `scheduler.enqueue` call-sites consult this ref; when `"blocked"` the
 * paragraphs are still recorded in `knownParagraphsRef` so a later Accept
 * can retroactively translate pages that already rendered.
 */
export const enqueuePolicyRef: { current: EnqueuePolicy } = {
  current: "blocked",
}

/**
 * Per-page cache of the paragraphs seen during overlay mount. Used by the
 * Accept flow to retroactively enqueue paragraphs from pages that rendered
 * under `activationMode === "ask"` before the user clicked Accept. Keyed by
 * 1-based pdf.js page number to match `overlayRoots` / pdf.js conventions.
 *
 * Cleared at the top of each `renderPdf` call, so a fresh session starts
 * empty.
 *
 * TODO(B3): like overlayRoots, entries accumulate per page within a single
 * PDF session and are never pruned. Bounded by page count (~1KB per entry),
 * tolerable for 500-page docs but worth revisiting during cache-layer work.
 */
export const knownParagraphsRef: { current: Map<number, Paragraph[]> } = {
  current: new Map(),
}

/**
 * Mutable handle to the function that retroactively enqueues all
 * currently-known paragraphs. Wired up once `renderPdf` has both the
 * scheduler and the fileHash in scope. The first-use toast's `onAccept`
 * handler calls this after flipping `enqueuePolicyRef.current` to
 * `"enabled"`. Kept separate from `schedulerRef` because retro-enqueue
 * also needs `fileHash` (which is only known inside `renderPdf`).
 */
const retroEnqueueRef: { current: () => void } = {
  current: () => {},
}

async function boot() {
  const src = parseSrcParam(location.search)
  if (!src) {
    document.body.textContent = "Missing ?src= parameter"
    return
  }

  // Compute the per-file fingerprint once. PR #B3 Task 6 swapped this from a
  // sync URL hash to an async content-based hash (fetch PDF bytes →
  // `crypto.subtle.digest`). On fetch failure it falls back internally to
  // `Sha256Hex(src)` so the viewer still boots even if the PDF can't be
  // re-fetched (CORS / file:// without access).
  const fileHash = await fingerprintForPdf(src)

  // Read once at boot time: the target language + translate provider id are
  // part of the cache key (PR #B3 Task 1). We snapshot them so a mid-session
  // config change doesn't produce mixed cache keys within one file. The
  // scheduler is per-file, so the next PDF open picks up the update.
  const config = (await getLocalConfig()) ?? DEFAULT_CONFIG
  const targetLang = config.language.targetCode
  const providerId = config.translate.providerId

  // Fresh file — reset the sticky quota-exhausted flag so a Free user whose
  // counter rolled over since their last session gets a clean chance today.
  quotaExhaustedRef.current = false

  // Per-file quota gate (PR #B3 Task 5). The gate is pure + imperative: it
  // reads Pro status from the shared entitlements atom, reads / increments
  // today's page counter from Dexie, and caps Free users at
  // `FREE_PDF_PAGES_PER_DAY`. Its `canTranslatePage` is consulted before
  // enqueuing a new page; `recordPageSuccess` is called from the
  // coordinator's `onPageSuccess` hook (fresh-only — cache hits bypass).
  //
  // `isPro` reads the entitlements atom synchronously. When the viewer boots
  // offline or before the M0 billing query has resolved, the atom still
  // holds `FREE_ENTITLEMENTS`, so the gate fails closed (Free cap applies).
  const quotaGate = createPdfQuotaGate({
    isPro: () => {
      const entitlements = pdfViewerStore.get(entitlementsAtom)
      return isPro(entitlements) && hasFeature(entitlements, "pdf_translate_unlimited")
    },
    getUsage: () => getPdfPageUsage(),
    increment: () => incrementPdfPageUsage(),
    limit: FREE_PDF_PAGES_PER_DAY,
  })
  quotaGateRef.current = quotaGate

  // Scheduler and coordinator are mutually referential: the coordinator's
  // miss path enqueues through the scheduler, and the scheduler's setStatus
  // tee notifies the coordinator on every paragraph transition. Declare the
  // scheduler first with a lazy coordinator reference, then instantiate the
  // coordinator with a direct binding.
  let coordinatorHandle: PageCacheCoordinator | null = null

  // One scheduler per file. Re-opening the same PDF (new tab / reload) gets a
  // fresh scheduler, which is what we want — no stale in-flight promises.
  //
  // The `setStatus` sink is a tee: the atom write drives the UI, and the
  // parsed (pageIndex, paragraphIndex) feeds the coordinator so it can track
  // per-page completion and write cache rows on full-page success.
  // `parseSegmentKey` is defensive — an unrecognised key format is simply
  // not forwarded to the coordinator (no crash, no double-write).
  const scheduler = new TranslationScheduler({
    translate: translateSegment,
    setStatus: (key: SegmentKey, status) => {
      pdfViewerStore.set(segmentStatusAtomFamily(key), status)
      if (!coordinatorHandle)
        return
      const parsed = parseSegmentKey(key)
      if (parsed)
        coordinatorHandle.recordParagraphResult(parsed.pageIndex, parsed.paragraphIndex, status)
    },
  })
  schedulerRef.current = scheduler

  // One coordinator per file — bridges the paragraph-granular scheduler with
  // the page-granular cache. `onPageSuccess` fires exactly once per freshly-
  // translated page (never for cache hits), which is the correct hook point
  // for the Free-tier quota counter (PR #B3 Task 5).
  //
  // Fresh-page completion flow:
  //   1. Coordinator calls `onPageSuccess(pageIndex)`.
  //   2. Gate increments the Dexie counter + returns the new count.
  //   3. If the new count hits `FREE_PDF_PAGES_PER_DAY` AND the user is Free,
  //      the scheduler aborts (no more fresh translations this session) and
  //      the UpgradeDialog atom flips on. The coordinator's tracking for
  //      already-started pages stays intact so late paragraph completions
  //      finish their cache writes — the abort only suppresses new jobs.
  //   4. `quotaExhaustedRef.current = true` so `mountOverlayForPage` on
  //      subsequent pages short-circuits before enqueuing.
  //
  // Pro users hit step 2 (counter increments for telemetry parity) but step 3
  // is a no-op because the gate reports `isPro() === true`.
  const coordinator = new PageCacheCoordinator({
    fileHash,
    targetLang,
    providerId,
    setSegmentStatus: (pageIndex, paragraphIndex, status) => {
      const key: SegmentKey = `${fileHash}:p-${pageIndex}-${paragraphIndex}`
      pdfViewerStore.set(segmentStatusAtomFamily(key), status)
    },
    enqueueSegment: (fh, paragraph) => scheduler.enqueue(fh, paragraph),
    getCachedPage,
    putCachedPage,
    touchCachedPage,
    onPageSuccess: (pageIndex) => {
      // Fire-and-forget: the counter write is best-effort and must not block
      // the UI. Failures are logged but don't reverse the on-screen success.
      void (async () => {
        try {
          const newCount = await quotaGate.recordPageSuccess()
          // Re-check Pro status on the result boundary — a mid-session plan
          // change is rare but the atom read is cheap and defends against
          // billing flaps.
          const entitlements = pdfViewerStore.get(entitlementsAtom)
          const pro = isPro(entitlements) && hasFeature(entitlements, "pdf_translate_unlimited")
          if (!pro && newCount >= FREE_PDF_PAGES_PER_DAY && !quotaExhaustedRef.current) {
            quotaExhaustedRef.current = true
            // Abort the scheduler so any still-pending fresh pages don't fire
            // their provider calls. Paragraphs that are already in-flight will
            // have their status writes suppressed (scheduler contract).
            scheduler.abort()
            // Flip the dialog visibility atom. A dedicated React root mounted
            // on `#upgrade-dialog-root` subscribes and renders the shared
            // UpgradeDialog component.
            pdfViewerStore.set(showPdfUpgradeDialogAtom, true)
          }
        }
        catch (err) {
          console.warn(
            `[pdf-viewer] quota recordPageSuccess failed for page ${pageIndex}`,
            err,
          )
        }
      })()
    },
  })
  coordinatorHandle = coordinator
  coordinatorRef.current = coordinator

  // Kick off PDF load and the activation-toast decision in parallel.
  // We don't block PDF rendering on the (async) config read for the toast.
  const toastPromise = maybeRenderFirstUseToast(src).catch((err) => {
    // Toast failures must never break the PDF render.
    console.error("[pdf-viewer] first-use toast setup failed:", err)
  })

  // Mount the UpgradeDialog root (PR #B3 Task 5). The dialog is invisible
  // until the quota-exhaustion flow flips `showPdfUpgradeDialogAtom` on.
  // Fire-and-forget — dialog mount failures must never break PDF render.
  const upgradeDialogPromise = mountUpgradeDialog().catch((err) => {
    console.error("[pdf-viewer] upgrade dialog mount failed:", err)
  })

  await renderPdf(src, { fileHash, coordinator })
  await toastPromise
  await upgradeDialogPromise
}

async function renderPdf(
  src: string,
  opts: {
    fileHash: string
    coordinator: PageCacheCoordinator
  },
) {
  const { fileHash, coordinator } = opts
  // Read activation mode once at render time. We snapshot it here (rather
  // than in `mountOverlayForPage`) so every page of a single open session
  // uses a consistent policy even if the user toggles the setting mid-view;
  // the scheduler is per-file, so the next PDF open picks up the change.
  const activationMode = (await getLocalConfig())?.pdfTranslation.activationMode
    ?? DEFAULT_CONFIG.pdfTranslation.activationMode

  // Seed the module-level enqueue policy from the activation mode. The
  // toast's Accept handler (below) flips `ask` from `blocked` → `enabled`
  // at runtime; `always` starts `enabled`; `manual` stays `blocked` for the
  // file's lifetime.
  enqueuePolicyRef.current = decideInitialPolicy(activationMode)
  // Fresh file — clear any paragraphs recorded by the previous document.
  knownParagraphsRef.current = new Map()

  // Expose the retroactive-enqueue closure to the toast handler. We define
  // it here (rather than in `maybeRenderFirstUseToast`) because it needs
  // `fileHash` + coordinator, both of which are in scope only inside
  // `renderPdf`. The toast handler calls `retroEnqueueRef.current()` after
  // flipping the policy ref.
  //
  // PR #B3 Task 4: retroactive enqueue now goes through the coordinator so
  // pages that rendered while the policy was `"blocked"` still benefit from
  // cache-first lookup (and write-on-success) when the user Accepts.
  retroEnqueueRef.current = () => {
    for (const [pageNumber, paragraphs] of knownParagraphsRef.current) {
      void coordinator.startPage(pageNumber - 1, paragraphs)
    }
  }
  // Lazy-load pdfjs so the initial bundle stays small and so tests can
  // import `parseSrcParam` (and friends) without pulling in the worker.
  const [pdfjsLib, pdfViewerMod] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/web/pdf_viewer.mjs"),
  ])
  const { EventBus, PDFLinkService, PDFViewer } = pdfViewerMod

  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString()

  const container = document.getElementById("viewer-container")
  if (!container)
    return

  const eventBus = new EventBus()
  const linkService = new PDFLinkService({ eventBus })
  const viewer = new PDFViewer({
    container: container as HTMLDivElement,
    eventBus,
    linkService,
  })
  linkService.setViewer(viewer)

  // Defense in depth: pdf-redirect already gates schemes before redirecting, but the
  // viewer is a web-accessible resource so any page could construct
  // chrome-extension://<id>/pdf-viewer.html?src=javascript:... . Reject anything
  // that isn't http(s) or file before pdf.js touches it.
  let parsedSrc: URL
  try {
    parsedSrc = new URL(src)
  }
  catch {
    document.body.textContent = "Invalid PDF URL"
    return
  }
  if (!["http:", "https:", "file:"].includes(parsedSrc.protocol)) {
    document.body.textContent = `Unsupported URL scheme: ${parsedSrc.protocol}`
    return
  }

  const loadingTask = pdfjsLib.getDocument({ url: src })
  const pdfDoc = await loadingTask.promise
  viewer.setDocument(pdfDoc)
  linkService.setDocument(pdfDoc)

  // Per-page React roots for the overlay layer. Keyed by page number (1-based
  // to match pdf.js conventions). We keep roots mounted for the lifetime of
  // the viewer: pdf.js emits `textlayerrendered` on every zoom / re-layout,
  // and re-invoking `root.render(...)` with fresh props is cheaper than
  // tearing down + re-mounting a React root. On page destruction pdf.js drops
  // the overlay `<div>` from the DOM, which orphans the root — acceptable for
  // a bounded-memory viewer tab; can be tightened in a later task if needed.
  //
  // Note: overlayRoots entries are not pruned when pdf.js destroys pages.
  // For large documents (500+ pages) this retains a small leak (React Root
  // + HTMLElement refs per page). Real cleanup needs a pdfjs eventBus event
  // for page destruction; pdfjs-dist 4.x exposes `pagechanging` / `pagesinit`
  // but not a clean per-page-destroyed hook. Revisit if memory becomes a
  // concern in long-session testing on big PDFs.
  const overlayRoots = new Map<number, {
    root: import("react-dom/client").Root
    container: HTMLElement
  }>()

  // Per-page monotonic sequence number used to defeat async races. Rapid
  // zoom fires `textlayerrendered` multiple times before the first
  // `getPage` / `getTextContent` await chain resolves; without this guard
  // the first-resolved (not latest-dispatched) render wins, which can paint
  // stale paragraphs at the wrong scale.
  const pendingSeq = new Map<number, number>()

  eventBus.on("textlayerrendered", (event: {
    pageNumber: number
    source?: unknown
  }) => {
    // The handler needs to read the PDF's text content (async) and render
    // React (which is fine to do synchronously). Spawn the async work in an
    // IIFE so pdf.js's event dispatch isn't awaiting us.
    void mountOverlayForPage(event.pageNumber, event.source)
  })

  async function mountOverlayForPage(pageNumber: number, source: unknown) {
    // Claim the latest sequence number for this page *before* any await, so
    // later invocations always see a higher seq and can supersede us.
    const seq = (pendingSeq.get(pageNumber) ?? 0) + 1
    pendingSeq.set(pageNumber, seq)

    try {
      // pdf.js gives us the PDFPageView on `event.source`. It has `.div` (page
      // container) and `.viewport` (current PageViewport with the active
      // scale + rotation + y-flip, exposed as a 6-element `transform` matrix).
      const pageView = source as {
        div?: HTMLElement
        viewport?: {
          transform?: [number, number, number, number, number, number]
        }
      } | undefined
      const pageContainer = pageView?.div
      if (!pageContainer)
        return
      const textLayer = pageContainer.querySelector(".textLayer") as HTMLElement | null
      if (!textLayer)
        return

      // Lazy imports keep the non-translation code paths (blocklisted docs,
      // unsupported URLs) off these modules entirely.
      const [
        reactDomClient,
        React,
        { Provider: JotaiProvider },
        { aggregate },
        { OverlayLayer },
        { computePageExtension, DEFAULT_MIN_SLOT_HEIGHT_PX },
        { SegmentContent },
      ] = await Promise.all([
        import("react-dom/client"),
        import("react"),
        import("jotai"),
        import("./paragraph/aggregate"),
        import("./overlay/layer"),
        import("./overlay/push-down-layout"),
        import("./overlay/segment-content"),
      ])

      const page = await pdfDoc.getPage(pageNumber)
      const content = await page.getTextContent()

      // Superseded by a newer textlayerrendered invocation (e.g. mid-zoom).
      // Drop this render so we don't paint stale coordinates.
      if (pendingSeq.get(pageNumber) !== seq)
        return

      // pdfjs-dist 4.x `TextContent.items` is `Array<TextItem | TextMarkedContent>`.
      // `TextMarkedContent` lacks `str` / `transform` and must be filtered out
      // before handing to our pure `aggregate()` function, which assumes
      // `TextItem` shape.
      const textItems = content.items.filter(
        (item): item is Extract<typeof item, { str: string, transform: [number, number, number, number, number, number] }> =>
          typeof (item as { str?: unknown }).str === "string"
          && Array.isArray((item as { transform?: unknown }).transform),
      )

      const pageIndex = pageNumber - 1
      const paragraphs = aggregate(
        // Structural cast to our redeclared `TextItem` (same field shape).
        textItems as unknown as Parameters<typeof aggregate>[0],
        { pageIndex },
      )

      // Mount overlay container (sibling of .textLayer) the first time we see
      // this page; reuse + re-render on subsequent textlayerrendered events.
      let entry = overlayRoots.get(pageNumber)
      if (!entry) {
        const overlayEl = document.createElement("div")
        overlayEl.className = "getu-overlay"
        overlayEl.dataset.pageIndex = String(pageIndex)
        // Absolute-positioned cover of the page; pointer events are disabled
        // so the textLayer underneath stays selectable.
        overlayEl.style.position = "absolute"
        overlayEl.style.inset = "0"
        overlayEl.style.pointerEvents = "none"
        pageContainer.appendChild(overlayEl)
        const root = reactDomClient.createRoot(overlayEl)
        entry = { root, container: overlayEl }
        overlayRoots.set(pageNumber, entry)
      }
      else if (!entry.container.isConnected) {
        // pdf.js recycled the page container (e.g. user scrolled far, page was
        // destroyed + re-rendered). Re-attach our overlay to the new container.
        pageContainer.appendChild(entry.container)
      }

      // Pass the live `PDFPageView.viewport` through so the overlay can apply
      // the current PDF→CSS transform (scale + y-flip + rotation). The viewport
      // prop is required on `OverlayLayer`; if pdf.js hasn't materialised one
      // (shouldn't happen on a real textlayerrendered event), skip the render
      // rather than paint slots at the wrong coordinates with a fallback.
      const rawTransform = pageView?.viewport?.transform
      if (!rawTransform) {
        console.warn(
          `[pdf-viewer] missing viewport.transform for page ${pageNumber}; skipping overlay render`,
        )
        return
      }
      const viewport = { transform: rawTransform }

      entry.root.render(
        React.createElement(
          JotaiProvider,
          { store: pdfViewerStore },
          React.createElement(OverlayLayer, {
            paragraphs,
            pageIndex,
            viewport,
            minSlotHeight: DEFAULT_MIN_SLOT_HEIGHT_PX,
            renderSlotContent: (paragraph) => {
              const key: SegmentKey = `${fileHash}:${paragraph.key}`
              return React.createElement(SegmentContent, { segmentKey: key })
            },
          }),
        ),
      )

      // Remember every paragraph we've seen for this page, regardless of
      // whether we're allowed to enqueue right now. The first-use toast's
      // Accept handler iterates this map to retroactively translate pages
      // that rendered while the policy was `"blocked"`.
      knownParagraphsRef.current.set(pageNumber, paragraphs)

      // Kick the coordinator once per page iff the current enqueue policy
      // permits it. PR #B3 Task 4: `coordinator.startPage` first checks the
      // page-level cache; on HIT it sets all paragraph statuses directly
      // (skipping the scheduler) and on MISS it enqueues every paragraph
      // via the scheduler. Either way it tracks per-page completion so a
      // full-page success triggers a cache write.
      //
      // Idempotency: the coordinator short-circuits repeat calls for an
      // already-cached / already-finalized page, and the scheduler dedups
      // re-enqueues while `pending` / `translating` / `done`, so hitting
      // `startPage` again on every `textlayerrendered` (zoom, re-layout) is
      // safe — each paragraph is translated exactly once per file lifetime.
      //
      // Policy source (see `decideInitialPolicy`):
      //   `"always"` → policy starts `"enabled"`, translate on sight.
      //   `"ask"`   → policy starts `"blocked"`; Accept flips to `"enabled"`
      //               and retroactively starts pages via `retroEnqueueRef`.
      //   `"manual"` → policy stays `"blocked"`; popup button path handles
      //                activation (out of scope for B2).
      //
      // Quota short-circuit (PR #B3 Task 5): once the Free-tier counter has
      // hit the cap this session, skip `startPage` entirely for new pages.
      // Cache-hit pages would also be gated here, which is acceptable — if
      // a Free user is over the limit we reserve their already-translated
      // pages from cache via the re-scroll flow (they'll hit this branch
      // but the coordinator's cache lookup inside `startPage` would serve
      // them for free). We let the coordinator decide: it does the cache
      // check, and cache hits never call `onPageSuccess` so they never
      // consume quota. So the only case we skip here is when the gate
      // already exhausted — cheap predicate, no extra Dexie read.
      if (enqueuePolicyRef.current === "enabled" && !quotaExhaustedRef.current) {
        void coordinator.startPage(pageIndex, paragraphs)
      }

      // Reserve vertical space below the pdf.js `.page` container so every
      // overlay slot has room without clipping into the next page. We write
      // this as `paddingBottom` because pdf.js's scroll / page-indicator
      // logic uses `getBoundingClientRect()` — which honours padding — so
      // navigation, scrollbar geometry, and the current-page readout all
      // stay consistent without us poking at pdf.js internals.
      //
      // PR #B1 linear model: `paragraphCount * minSlotHeight`. PR #B2 will
      // swap this for per-slot measured heights once real translation text
      // lands in each slot.
      const extensionPx = computePageExtension(
        paragraphs,
        DEFAULT_MIN_SLOT_HEIGHT_PX,
      )
      pageContainer.style.paddingBottom = `${extensionPx}px`
    }
    catch (err) {
      // Without this catch, `void mountOverlayForPage(...)` at the event-bus
      // call site would swallow rejections from `getPage` /
      // `getTextContent` / dynamic imports. Surface them so they're
      // diagnosable while still letting later textlayerrendered events
      // retry.
      console.error(
        `[pdf-viewer] overlay mount failed for page ${pageNumber}:`,
        err,
      )
    }
  }
}

/**
 * When `pdfTranslation.activationMode === "ask"` AND the domain is NOT already
 * in the blocklist, mount a React root rendering the first-use activation
 * toast. Otherwise do nothing.
 *
 * The toast's "Never on this site" action writes the current domain into
 * `pdfTranslation.blocklistDomains`; on subsequent navigations the background
 * redirect sees the domain in the blocklist and skips the viewer, returning
 * the user to the browser's native PDF handling.
 */
async function maybeRenderFirstUseToast(src: string) {
  const config = (await getLocalConfig()) ?? DEFAULT_CONFIG
  const { activationMode, blocklistDomains } = config.pdfTranslation

  // Only the "ask" path shows the toast. "always" skips directly to translation
  // (once PR #B lands); "manual" shouldn't reach the viewer via redirect at all,
  // but defensively we skip the toast for it too.
  if (activationMode !== "ask")
    return

  // Lazy-load the domain util + React deps so the non-toast path (always / manual /
  // blocklisted) stays on the cheap code path.
  const { extractDomain } = await import("@/utils/pdf/domain")
  const domain = extractDomain(src)
  if (!domain)
    return

  // Match the background's decideRedirect semantics: exact hostname OR any-depth
  // subdomain. Keeps the toast in sync with the redirect — a blocklist entry of
  // "evil.com" suppresses the toast on docs.evil.com too.
  const normalizedBlocklist = blocklistDomains
    .map(d => d.trim().toLowerCase())
    .filter(d => d.length > 0)
  const isBlocked = normalizedBlocklist.some(
    blocked => domain === blocked || domain.endsWith(`.${blocked}`),
  )
  if (isBlocked)
    return

  const mountNode = document.getElementById("first-use-toast-root")
  if (!mountNode)
    return

  const [{ createRoot }, React, { Provider: JotaiProvider }, { FirstUseToast }] = await Promise.all([
    import("react-dom/client"),
    import("react"),
    import("jotai"),
    import("./components/first-use-toast"),
  ])

  const root = createRoot(mountNode)

  const unmount = () => {
    // Defer unmount to avoid tearing down during React's own event dispatch.
    setTimeout(() => root.unmount(), 0)
  }

  root.render(
    React.createElement(
      JotaiProvider,
      { store: pdfViewerStore },
      React.createElement(FirstUseToast, {
        onAccept: () => {
          // Flip the module-level policy so every future page render (and
          // re-render on zoom) auto-enqueues its paragraphs. `retroEnqueueRef`
          // walks `knownParagraphsRef` to catch up pages that already mounted
          // while we were `"blocked"`. Scheduler-level dedup makes the
          // retro-enqueue safe even if a paragraph happens to be re-seen
          // later on a zoom event.
          enqueuePolicyRef.current = "enabled"
          retroEnqueueRef.current()
          unmount()
        },
        onSkipOnce: () => {
          // User declined for this session. Leave the policy `"blocked"` so
          // the scheduler stays idle; the PDF continues to render via native
          // pdf.js with empty placeholder slots.
          unmount()
        },
        onNever: async () => {
          try {
            // Route through the shared Jotai store so the write goes via
            // `addDomainToBlocklistAtom` (which dedupes + normalises +
            // deep-merges through `configFieldsAtomMap.pdfTranslation`).
            await pdfViewerStore.set(addDomainToBlocklistAtom, domain)
            // Reload so the background redirect re-evaluates against the fresh
            // blocklist and returns the user to native PDFium handling.
            // Note: no explicit `unmount()` — the page reload tears the document
            // down anyway, and the setTimeout(0) that unmount schedules would
            // not fire before navigation.
            location.reload()
          }
          catch (err) {
            console.error(
              "[pdf-viewer] failed to persist blocklist; not reloading",
              err,
            )
          }
        },
      }),
    ),
  )
}

/**
 * Mount the PDF-translation UpgradeDialog into its dedicated root
 * (`#upgrade-dialog-root`). The dialog starts hidden; main.ts's quota-
 * exhaustion handler flips `showPdfUpgradeDialogAtom` to open it.
 *
 * Pulled out of `boot()` so tests can exercise the mount independently and
 * so dialog setup can fail without taking down the PDF render (see the
 * fire-and-forget `.catch` at the call site).
 */
async function mountUpgradeDialog() {
  const mountNode = document.getElementById("upgrade-dialog-root")
  if (!mountNode)
    return

  const [{ createRoot }, React, { Provider: JotaiProvider }, { PdfUpgradeDialogMount }] = await Promise.all([
    import("react-dom/client"),
    import("react"),
    import("jotai"),
    import("./components/pdf-upgrade-dialog-mount"),
  ])

  const root = createRoot(mountNode)
  root.render(
    React.createElement(
      JotaiProvider,
      { store: pdfViewerStore },
      React.createElement(PdfUpgradeDialogMount),
    ),
  )
}

boot().catch((err) => {
  document.body.textContent = `Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`
})
