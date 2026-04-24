import { browser, i18n } from "#imports"
import { IconCards } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/base-ui/tooltip"
import { getDueWords } from "@/utils/db/dexie/words"

export function ReviewEntryButton() {
  const [dueCount, setDueCount] = useState(0)

  useEffect(() => {
    void getDueWords().then(words => setDueCount(words.length))
  }, [])

  const handleClick = async () => {
    const url = `${browser.runtime.getURL("/options.html")}#/review`
    await browser.tabs.create({ url })
    window.close()
  }

  const badgeLabel = dueCount > 99 ? "99+" : String(dueCount)

  const tooltipText
    = dueCount > 0
      ? i18n.t("popup.review.dueTooltip", [String(dueCount)])
      : i18n.t("popup.review.tooltip")

  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={handleClick} />}>
        <span className="relative">
          <IconCards />
          {dueCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
              {badgeLabel}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[200px] text-wrap">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}
