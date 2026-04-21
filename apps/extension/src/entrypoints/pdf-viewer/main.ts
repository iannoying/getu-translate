import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { parseSrcParam } from "./parse-src-param"
import "pdfjs-dist/web/pdf_viewer.css"
import "./style.css"

async function boot() {
  const src = parseSrcParam(location.search)
  if (!src) {
    document.body.textContent = "Missing ?src= parameter"
    return
  }

  // Kick off PDF load and the activation-toast decision in parallel.
  // We don't block PDF rendering on the (async) config read for the toast.
  const toastPromise = maybeRenderFirstUseToast(src).catch((err) => {
    // Toast failures must never break the PDF render.
    console.error("[pdf-viewer] first-use toast setup failed:", err)
  })

  await renderPdf(src)
  await toastPromise
}

async function renderPdf(src: string) {
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

  const loadingTask = pdfjsLib.getDocument({ url: src })
  const pdfDoc = await loadingTask.promise
  viewer.setDocument(pdfDoc)
  linkService.setDocument(pdfDoc)
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

  const normalizedBlocklist = blocklistDomains.map(d =>
    d.trim().toLowerCase(),
  )
  if (normalizedBlocklist.includes(domain))
    return

  const mountNode = document.getElementById("first-use-toast-root")
  if (!mountNode)
    return

  const [{ createRoot }, React, { FirstUseToast }, { storageAdapter }, { configSchema }, { CONFIG_STORAGE_KEY }] = await Promise.all([
    import("react-dom/client"),
    import("react"),
    import("./components/first-use-toast"),
    import("@/utils/atoms/storage-adapter"),
    import("@/types/config/config"),
    import("@/utils/constants/config"),
  ])

  const root = createRoot(mountNode)

  const addDomainToBlocklist = async () => {
    // NOTE: We write through storageAdapter directly rather than using the
    // addDomainToBlocklistAtom from utils/atoms/pdf-translation. Rationale:
    // the pdf-viewer entrypoint currently has no Jotai Provider / Store, so
    // atoms cannot be used here without pulling in the full atom runtime just
    // for one write. The storage key + schema are identical, so the persisted
    // result is indistinguishable across paths.
    // TODO(M3-PR-B): if a Jotai Provider is added to the viewer (e.g. for the
    // translation overlay), replace this with `set(addDomainToBlocklistAtom, domain)`.
    const current = (await storageAdapter.get(
      CONFIG_STORAGE_KEY,
      DEFAULT_CONFIG,
      configSchema,
    )) ?? DEFAULT_CONFIG
    const existing = current.pdfTranslation.blocklistDomains
    if (existing.some(d => d.trim().toLowerCase() === domain))
      return
    const next = {
      ...current,
      pdfTranslation: {
        ...current.pdfTranslation,
        blocklistDomains: [...existing, domain],
      },
    }
    await storageAdapter.set(CONFIG_STORAGE_KEY, next, configSchema)
    await storageAdapter.setMeta(CONFIG_STORAGE_KEY, {
      lastModifiedAt: Date.now(),
    })
  }

  const unmount = () => {
    // Defer unmount to avoid tearing down during React's own event dispatch.
    setTimeout(() => root.unmount(), 0)
  }

  root.render(
    React.createElement(FirstUseToast, {
      onAccept: () => {
        // TODO(M3-PR-B): trigger the bilingual translation pipeline here.
        // PR #A only dismisses the toast — the viewer continues to render
        // the PDF using native pdf.js without translation overlay.
        unmount()
      },
      onSkipOnce: () => {
        unmount()
      },
      onNever: async () => {
        try {
          await addDomainToBlocklist()
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
  )
}

boot().catch((err) => {
  document.body.textContent = `Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`
})
