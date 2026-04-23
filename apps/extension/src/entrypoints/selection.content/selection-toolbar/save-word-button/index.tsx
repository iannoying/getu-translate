import { i18n } from "#imports"
import { IconBookmark, IconBookmarkFilled } from "@tabler/icons-react"
import { SelectionToolbarTooltip } from "../../components/selection-tooltip"
import { useSaveWord } from "./provider"

export function SaveWordButton() {
  const { saved, selectionContent, handleSave } = useSaveWord()
  const tooltipText = saved ? i18n.t("wordbook.saved") : i18n.t("wordbook.save")

  return (
    <SelectionToolbarTooltip
      content={tooltipText}
      render={(
        <button
          type="button"
          className="px-2 h-7 flex items-center justify-center hover:bg-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleSave}
          disabled={!selectionContent || saved}
          aria-label={tooltipText}
        />
      )}
    >
      {saved
        ? <IconBookmarkFilled className="size-4.5" strokeWidth={1.6} />
        : <IconBookmark className="size-4.5" strokeWidth={1.6} />}
    </SelectionToolbarTooltip>
  )
}
