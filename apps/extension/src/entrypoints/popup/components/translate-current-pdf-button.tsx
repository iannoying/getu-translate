import { browser } from "#imports"
import { Button } from "@/components/ui/base-ui/button"
import { useIsCurrentTabPdf } from "@/hooks/use-is-current-tab-pdf"
import { i18n } from "@/utils/i18n"
import { buildWebTranslateUrl } from "@/utils/pdf-detection"
import { cn } from "@/utils/styles/utils"

export default function TranslateCurrentPdfButton({ className }: { className?: string }) {
  const { loading, url, isPdf } = useIsCurrentTabPdf()

  if (loading || !isPdf || !url)
    return null

  const handleClick = async () => {
    await browser.tabs.create({ url: buildWebTranslateUrl(url) })
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
