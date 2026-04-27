import type { LangCodeISO6393 } from "@getu/definitions"
import type { SidebarLanguageCode } from "./language-options"
import { IconArrowsExchange, IconChevronDown } from "@tabler/icons-react"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/base-ui/popover"
import { i18n } from "@/utils/i18n"
import {
  fromSidebarLanguageCode,
  SIDEBAR_SOURCE_LANGUAGES,
  SIDEBAR_TARGET_LANGUAGES,
  toSidebarLanguageCode,
} from "./language-options"

const UNSUPPORTED_SOURCE_VALUE = "__unsupported_source_language__"
const UNSUPPORTED_TARGET_VALUE = "__unsupported_target_language__"

interface WorkbenchLanguagePickerProps {
  source: LangCodeISO6393 | "auto"
  target: LangCodeISO6393
  onSourceChange: (value: LangCodeISO6393 | "auto") => void
  onTargetChange: (value: LangCodeISO6393) => void
  onSwap: () => void
  portalContainer: HTMLElement
}

interface LanguageSelectProps {
  value: SidebarLanguageCode | undefined
  fallbackValue: string
  label: string
  triggerLabel: string
  unsupportedLabel: string
  options: typeof SIDEBAR_SOURCE_LANGUAGES
  portalContainer: HTMLElement
  onValueChange: (value: SidebarLanguageCode) => void
}

function unsupportedLanguageLabel(code: LangCodeISO6393 | "auto"): string {
  return `Unsupported language (${code})`
}

function isSourceLanguageCode(value: string): value is SidebarLanguageCode {
  return SIDEBAR_SOURCE_LANGUAGES.some(option => option.code === value)
}

function isTargetLanguageCode(value: string): value is SidebarLanguageCode {
  return SIDEBAR_TARGET_LANGUAGES.some(option => option.code === value)
}

function getLanguageLabel(code: LangCodeISO6393 | "auto"): string {
  const option = SIDEBAR_SOURCE_LANGUAGES.find(option => option.iso6393 === code)
  return option ? i18n.t(option.labelKey) : unsupportedLanguageLabel(code)
}

function LanguageSelect({
  value,
  fallbackValue,
  label,
  triggerLabel,
  unsupportedLabel,
  options,
  portalContainer,
  onValueChange,
}: LanguageSelectProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            aria-label={triggerLabel}
            aria-expanded={open}
            className="h-12 min-w-0 rounded-none border-0 bg-transparent px-3 text-sm font-medium shadow-none sm:px-4"
          >
            <span className="flex min-w-0 flex-1 text-left">
              <span className="truncate">{label}</span>
            </span>
            <IconChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        )}
      />
      <PopoverContent
        container={portalContainer}
        positionerClassName="z-[2147483647]"
        className="z-[2147483647] max-h-[min(24rem,var(--available-height))] min-w-36 overflow-y-auto p-1"
      >
        <div role="group" aria-label={triggerLabel}>
          {value === undefined && (
            <button
              type="button"
              disabled
              value={fallbackValue}
              className="flex w-full cursor-default items-center rounded-md px-2 py-1.5 text-left text-sm opacity-50"
            >
              {unsupportedLabel}
            </button>
          )}
          {options.map(option => (
            <button
              key={option.code}
              type="button"
              aria-pressed={value === option.code}
              className="flex w-full cursor-default items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:text-accent-foreground focus:outline-hidden"
              onClick={() => {
                onValueChange(option.code)
                setOpen(false)
              }}
            >
              {i18n.t(option.labelKey)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function WorkbenchLanguagePicker({
  source,
  target,
  onSourceChange,
  onTargetChange,
  onSwap,
  portalContainer,
}: WorkbenchLanguagePickerProps) {
  const sourceCode = toSidebarLanguageCode(source)
  const targetCode = toSidebarLanguageCode(target)
  const sourceValue = sourceCode ?? UNSUPPORTED_SOURCE_VALUE
  const targetValue = targetCode ?? UNSUPPORTED_TARGET_VALUE

  return (
    <div className="border-border bg-muted/60 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center overflow-hidden rounded-md border">
      <LanguageSelect
        value={sourceCode}
        fallbackValue={sourceValue}
        label={getLanguageLabel(source)}
        triggerLabel={`Source language: ${getLanguageLabel(source)}`}
        unsupportedLabel={unsupportedLanguageLabel(source)}
        options={SIDEBAR_SOURCE_LANGUAGES}
        portalContainer={portalContainer}
        onValueChange={(value) => {
          if (isSourceLanguageCode(value))
            onSourceChange(fromSidebarLanguageCode(value))
        }}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mx-1 size-9 rounded-full"
        disabled={source === "auto"}
        aria-label={i18n.t("translationWorkbench.swapLanguages")}
        title={i18n.t("translationWorkbench.swapLanguages")}
        onClick={onSwap}
      >
        <IconArrowsExchange className="size-4" />
      </Button>

      <LanguageSelect
        value={targetCode}
        fallbackValue={targetValue}
        label={getLanguageLabel(target)}
        triggerLabel={`Target language: ${getLanguageLabel(target)}`}
        unsupportedLabel={unsupportedLanguageLabel(target)}
        options={SIDEBAR_TARGET_LANGUAGES}
        portalContainer={portalContainer}
        onValueChange={(value) => {
          if (!isTargetLanguageCode(value))
            return
          const next = fromSidebarLanguageCode(value)
          if (next !== "auto")
            onTargetChange(next)
        }}
      />
    </div>
  )
}
