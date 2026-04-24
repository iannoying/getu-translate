import { RiTranslate } from "@remixicon/react"
import { SelectionPopover } from "@/components/ui/selection-popover"
import { i18n } from "@/utils/i18n"
import { SelectionToolbarTooltip } from "../../components/selection-tooltip"
import { useSelectionTranslationPopover } from "./provider"

export function TranslateButton() {
  const { prepareToolbarOpen } = useSelectionTranslationPopover()
  const triggerLabel = i18n.t("action.translation")

  return (
    <SelectionToolbarTooltip
      content={triggerLabel}
      render={(
        <SelectionPopover.Trigger
          aria-label={triggerLabel}
          onClick={(event) => {
            event.currentTarget.blur()
            prepareToolbarOpen()
          }}
        />
      )}
    >
      <RiTranslate className="size-4.5" />
    </SelectionToolbarTooltip>
  )
}
