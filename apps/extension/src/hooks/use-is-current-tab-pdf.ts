import { browser } from "#imports"
import { useEffect, useState } from "react"
import { sendMessage } from "@/utils/message"
import { isPdfLikeUrl } from "@/utils/pdf-detection"

export interface CurrentTabPdfState {
  /** True until the active-tab query + background lookup finishes. */
  loading: boolean
  /** Active tab URL (empty string until loaded). */
  url: string
  /** Whether the active tab is a PDF (by URL heuristic OR background tracker). */
  isPdf: boolean
}

/**
 * Resolves whether the popup's active tab is a PDF, combining:
 *   1. Synchronous URL heuristic (`isPdfLikeUrl`) — covers `.pdf` suffix and
 *      arxiv / openreview style extensionless PDFs.
 *   2. Async background message (`isTabPdf`) — falls back to the
 *      content-type tracker for everything else (CMS download handlers, etc.).
 *
 * Returns `loading: true` until both steps resolve so callers can render
 * neither button (avoids a brief flash of the wrong UI).
 */
export function useIsCurrentTabPdf(): CurrentTabPdfState {
  const [state, setState] = useState<CurrentTabPdfState>({
    loading: true,
    url: "",
    isPdf: false,
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      if (cancelled)
        return
      const tab = tabs[0]
      const url = tab?.url ?? ""
      const tabId = tab?.id

      // Fast path: synchronous URL heuristic.
      if (isPdfLikeUrl(url)) {
        setState({ loading: false, url, isPdf: true })
        return
      }

      // Slow path: ask the background tracker (catches arxiv-misses + CMS
      // handlers + any other extensionless PDF URL we didn't pattern-match).
      if (typeof tabId === "number") {
        try {
          const isPdf = await sendMessage("isTabPdf", { tabId })
          if (cancelled)
            return
          setState({ loading: false, url, isPdf: !!isPdf })
          return
        }
        catch {
          // Background unavailable (extension-context-invalidated, SW evicted
          // mid-navigation, etc.) — fall through to non-PDF default.
        }
      }

      setState({ loading: false, url, isPdf: false })
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
