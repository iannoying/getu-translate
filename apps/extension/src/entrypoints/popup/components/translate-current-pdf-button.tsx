import { browser } from "#imports"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"

const VIEWER_PATH = "/pdf-viewer.html"

function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.pathname.toLowerCase().endsWith(".pdf")
  }
  catch {
    return false
  }
}

function isOurViewerUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === "chrome-extension:" || parsed.protocol === "moz-extension:")
      && parsed.pathname === VIEWER_PATH
    )
  }
  catch {
    return false
  }
}

export default function TranslateCurrentPdfButton({ className }: { className?: string }) {
  const [currentTabId, setCurrentTabId] = useState<number | undefined>(undefined)
  const [currentUrl, setCurrentUrl] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      if (cancelled)
        return
      const tab = tabs[0]
      setCurrentTabId(tab?.id)
      setCurrentUrl(tab?.url ?? "")
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!currentUrl)
    return null
  if (isOurViewerUrl(currentUrl))
    return null
  if (!isPdfUrl(currentUrl))
    return null

  const handleClick = async () => {
    if (currentTabId === undefined)
      return
    const viewerUrl = `${browser.runtime.getURL(VIEWER_PATH)}?src=${encodeURIComponent(currentUrl)}`
    await browser.tabs.update(currentTabId, { url: viewerUrl })
    window.close()
  }

  return (
    <Button
      onClick={handleClick}
      className={cn("block truncate", className)}
    >
      {i18n.t("popup.translateCurrentPdf")}
    </Button>
  )
}
