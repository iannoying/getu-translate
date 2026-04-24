import { useAtom } from "jotai"
import { useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/base-ui/input"
import { Label } from "@/components/ui/base-ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/base-ui/radio-group"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { ConfigCard } from "../../components/config-card"

const MIN_PREFIX = 1
const MAX_PREFIX = 4

export function InputTranslationTriggerMode() {
  const [config, setConfig] = useAtom(configFieldsAtomMap.inputTranslation)
  const [draftPrefix, setDraftPrefix] = useState(config.tokenPrefix)

  return (
    <ConfigCard
      id="input-translation-trigger-mode-section"
      title={i18n.t("options.inputTranslation.triggerMode.title")}
      description={i18n.t("options.inputTranslation.triggerMode.description")}
    >
      <RadioGroup
        value={config.triggerMode}
        onValueChange={async (value) => {
          await setConfig({
            ...config,
            triggerMode: value as "triple-space" | "token",
          })
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start space-x-2">
          <RadioGroupItem value="triple-space" id="trigger-mode-triple-space" className="mt-1" />
          <Label htmlFor="trigger-mode-triple-space" className="flex flex-col items-start cursor-pointer">
            <span>{i18n.t("options.inputTranslation.triggerMode.tripleSpace.label")}</span>
            <span className="text-xs text-muted-foreground font-normal">
              {i18n.t("options.inputTranslation.triggerMode.tripleSpace.hint")}
            </span>
          </Label>
        </div>
        <div className="flex items-start space-x-2">
          <RadioGroupItem value="token" id="trigger-mode-token" className="mt-1" />
          <Label htmlFor="trigger-mode-token" className="flex flex-col items-start cursor-pointer">
            <span>{i18n.t("options.inputTranslation.triggerMode.token.label")}</span>
            <span className="text-xs text-muted-foreground font-normal">
              {i18n.t("options.inputTranslation.triggerMode.token.hint")}
            </span>
          </Label>
        </div>
      </RadioGroup>

      {config.triggerMode === "token" && (
        <div className="mt-6 flex items-center gap-3">
          <Label htmlFor="input-translation-token-prefix" className="shrink-0">
            {i18n.t("options.inputTranslation.triggerMode.prefixLabel")}
          </Label>
          <Input
            id="input-translation-token-prefix"
            className="w-24"
            type="text"
            maxLength={MAX_PREFIX}
            value={draftPrefix}
            onChange={e => setDraftPrefix(e.target.value)}
            onBlur={async () => {
              const trimmed = draftPrefix.trim()
              if (trimmed.length < MIN_PREFIX || trimmed.length > MAX_PREFIX) {
                toast.error(i18n.t("options.inputTranslation.triggerMode.prefixError", [MIN_PREFIX, MAX_PREFIX]))
                setDraftPrefix(config.tokenPrefix)
                return
              }
              if (trimmed !== config.tokenPrefix) {
                await setConfig({ ...config, tokenPrefix: trimmed })
              }
              setDraftPrefix(trimmed)
            }}
          />
        </div>
      )}
    </ConfigCard>
  )
}
