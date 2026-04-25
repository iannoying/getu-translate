import { browser } from "#imports"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { WEB_DOCUMENT_TRANSLATE_URL } from "@/utils/constants/url"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"

function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.pathname.toLowerCase().endsWith(".pdf")
  }
  catch {
    return false
  }
}

function buildWebTranslateUrl(srcUrl: string): string {
  return `${WEB_DOCUMENT_TRANSLATE_URL}?src=${encodeURIComponent(srcUrl)}`
}

export default function TranslateCurrentPdfButton({ className }: { className?: string }) {
  const [currentUrl, setCurrentUrl] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      if (cancelled)
        return
      const tab = tabs[0]
      setCurrentUrl(tab?.url ?? "")
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!currentUrl)
    return null
  if (!isPdfUrl(currentUrl))
    return null

  const handleClick = async () => {
    await browser.tabs.create({ url: buildWebTranslateUrl(currentUrl) })
    window.close()
  }

  return (
    <Button
      onClick={handleClick}
      className={cn("block truncate", className)}
    >
      {i18n.t("popup.translatePdfOnWeb")}
    </Button>
  )
}
