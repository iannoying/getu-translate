import type { LangCodeISO6393 } from "@getu/definitions"
import type { SidebarLanguageCode } from "./language-options"
import { IconArrowsExchange } from "@tabler/icons-react"
import { Button } from "@/components/ui/base-ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
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
      <Select
        value={sourceValue}
        onValueChange={(value) => {
          if (value === null)
            return
          if (isSourceLanguageCode(value))
            onSourceChange(fromSidebarLanguageCode(value))
        }}
      >
        <SelectTrigger className="h-12 min-w-0 rounded-none border-0 bg-transparent px-3 text-sm font-medium shadow-none sm:px-4">
          <SelectValue>
            <span className="truncate">{getLanguageLabel(source)}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent container={portalContainer}>
          {sourceCode === undefined && (
            <SelectItem value={UNSUPPORTED_SOURCE_VALUE} disabled>
              {unsupportedLanguageLabel(source)}
            </SelectItem>
          )}
          {SIDEBAR_SOURCE_LANGUAGES.map(option => (
            <SelectItem key={option.code} value={option.code}>
              {i18n.t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

      <Select
        value={targetValue}
        onValueChange={(value) => {
          if (value === null)
            return
          if (!isTargetLanguageCode(value))
            return
          const next = fromSidebarLanguageCode(value)
          if (next !== "auto")
            onTargetChange(next)
        }}
      >
        <SelectTrigger className="h-12 min-w-0 rounded-none border-0 bg-transparent px-3 text-sm font-medium shadow-none sm:px-4">
          <SelectValue>
            <span className="truncate">{getLanguageLabel(target)}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent container={portalContainer}>
          {targetCode === undefined && (
            <SelectItem value={UNSUPPORTED_TARGET_VALUE} disabled>
              {unsupportedLanguageLabel(target)}
            </SelectItem>
          )}
          {SIDEBAR_TARGET_LANGUAGES.map(option => (
            <SelectItem key={option.code} value={option.code}>
              {i18n.t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
