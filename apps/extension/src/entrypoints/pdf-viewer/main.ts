import type { Paragraph } from "./paragraph/types"
import type { SegmentKey } from "./translation/atoms"
import type { EnqueuePolicy } from "./translation/enqueue-policy"
import { createStore } from "jotai"
import { addDomainToBlocklistAtom } from "@/utils/atoms/pdf-translation"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { fingerprintForSrc } from "@/utils/pdf/fingerprint"
import { parseSrcParam } from "./parse-src-param"
import { segmentStatusAtomFamily } from "./translation/atoms"
import { decideInitialPolicy } from "./translation/enqueue-policy"
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

  // Compute the per-file fingerprint once. PR #B3 will swap in a real
  // content-based hash; for B2 `sha256(src)` is deterministic and sufficient
  // to keep segment atoms from different PDFs out of each other's way.
  const fileHash = fingerprintForSrc(src)

  // One scheduler per file. Re-opening the same PDF (new tab / reload) gets a
  // fresh scheduler, which is what we want — no stale in-flight promises.
  const scheduler = new TranslationScheduler({
    translate: translateSegment,
    setStatus: (key: SegmentKey, status) =>
      pdfViewerStore.set(segmentStatusAtomFamily(key), status),
  })
  schedulerRef.current = scheduler

  // Kick off PDF load and the activation-toast decision in parallel.
  // We don't block PDF rendering on the (async) config read for the toast.
  const toastPromise = maybeRenderFirstUseToast(src).catch((err) => {
    // Toast failures must never break the PDF render.
    console.error("[pdf-viewer] first-use toast setup failed:", err)
  })

  await renderPdf(src, { fileHash, scheduler })
  await toastPromise
}

async function renderPdf(
  src: string,
  opts: { fileHash: string, scheduler: TranslationScheduler },
) {
  const { fileHash, scheduler } = opts
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
  // `fileHash` + `scheduler`, both of which are in scope only inside
  // `renderPdf`. The toast handler calls `retroEnqueueRef.current()` after
  // flipping the policy ref.
  retroEnqueueRef.current = () => {
    for (const paragraphs of knownParagraphsRef.current.values()) {
      for (const paragraph of paragraphs) {
        scheduler.enqueue(fileHash, paragraph)
      }
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

      // Kick the scheduler once per paragraph iff the current enqueue policy
      // permits it. Scheduler dedups re-enqueues while `pending` /
      // `translating` / `done`, so hitting it again on every
      // `textlayerrendered` (zoom, re-layout) is safe — each paragraph is
      // translated exactly once per scheduler lifetime.
      //
      // Policy source (see `decideInitialPolicy`):
      //   `"always"` → policy starts `"enabled"`, translate on sight.
      //   `"ask"`   → policy starts `"blocked"`; Accept flips to `"enabled"`
      //               and retroactively enqueues via `retroEnqueueRef`.
      //   `"manual"` → policy stays `"blocked"`; popup button path handles
      //                activation (out of scope for B2).
      if (enqueuePolicyRef.current === "enabled") {
        for (const paragraph of paragraphs) {
          scheduler.enqueue(fileHash, paragraph)
        }
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

boot().catch((err) => {
  document.body.textContent = `Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`
})
