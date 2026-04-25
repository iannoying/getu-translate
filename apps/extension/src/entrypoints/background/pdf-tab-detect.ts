import { browser } from "#imports"
import { logger } from "@/utils/logger"

/**
 * In-memory `tabId → isPdf` flag set. Lives in the background SW; lost on
 * SW eviction and rebuilt as the tab navigates again. We deliberately avoid
 * persisting this — it's cheap to recompute and persisted state across SW
 * wakeups can lie if the user navigated away while we were dormant.
 */
const pdfTabs = new Set<number>()

export function isPdfTab(tabId: number): boolean {
  return pdfTabs.has(tabId)
}

/** Test hook — never call from production code. */
export function _resetPdfTabsForTest() {
  pdfTabs.clear()
}

/**
 * Passive PDF-tab tracker. Two signals feed the set:
 *   1. `webRequest.onHeadersReceived` for top-frame loads — the authoritative
 *      check (`Content-Type: application/pdf`). Catches arxiv-style URLs that
 *      serve PDFs without a `.pdf` extension.
 *   2. `webNavigation.onCommitted` for top-frame navigations whose URL ends
 *      `.pdf` — covers the path-suffix case even when headers are missing
 *      (e.g. `file://` URLs that don't go through `webRequest`).
 *
 * Either signal *adds* the tabId; a non-PDF Content-Type or a navigation away
 * from a `.pdf`-suffix URL *clears* it.
 *
 * Tab close clears the entry to avoid leaks.
 */
export function setUpPdfTabDetect() {
  browser.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId < 0 || details.frameId !== 0)
        return
      let contentType = ""
      for (const h of details.responseHeaders ?? []) {
        if (h.name.toLowerCase() === "content-type") {
          contentType = (h.value ?? "").toLowerCase()
          break
        }
      }
      if (contentType.startsWith("application/pdf")) {
        pdfTabs.add(details.tabId)
      }
      else {
        // The same tab navigated to a non-PDF resource — drop any stale flag.
        pdfTabs.delete(details.tabId)
      }
    },
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["responseHeaders"],
  )

  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0)
      return
    try {
      const url = new URL(details.url)
      if (url.pathname.toLowerCase().endsWith(".pdf")) {
        pdfTabs.add(details.tabId)
      }
      // Note: we deliberately do NOT clear here on non-`.pdf` URLs.
      // `webRequest.onHeadersReceived` is the authoritative signal for that.
    }
    catch {
      // Malformed URL (about:blank, javascript:, etc.) — leave any prior flag
      // in place; webRequest will correct it on the next real navigation.
    }
  })

  browser.tabs.onRemoved.addListener((tabId) => {
    pdfTabs.delete(tabId)
  })

  logger.info("[Background][PdfTabDetect] tracker installed")
}
