import { useAtom, useAtomValue } from "jotai"
import { useEffect, useMemo } from "react"
import { HelpTooltip } from "@/components/help-tooltip"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import { isLLMProvider, isTranslateProvider } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { filterEnabledProvidersConfig } from "@/utils/config/helpers"
import { i18n } from "@/utils/i18n"

export default function TranslateProviderField() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)

  const providers = useMemo(() => {
    const exclude = translateConfig.mode === "translationOnly" ? ["google-translate"] : undefined
    return filterEnabledProvidersConfig(providersConfig)
      .filter(p => isTranslateProvider(p.provider))
      .filter(p => !isLLMProvider(p.provider) || p.provider === "getu-pro")
      .filter(p => !exclude?.includes(p.provider))
  }, [providersConfig, translateConfig.mode])

  useEffect(() => {
    if (providers.length === 0 || providers.some(provider => provider.id === translateConfig.providerId)) {
      return
    }

    void setTranslateConfig({ providerId: providers[0].id })
  }, [providers, setTranslateConfig, translateConfig.providerId])

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-medium flex items-center gap-1.5">
        {i18n.t("translateService.title")}
        <HelpTooltip>
          {i18n.t("translateService.description")}
        </HelpTooltip>
      </span>
      <ProviderSelector
        providers={providers}
        value={translateConfig.providerId}
        onChange={id => void setTranslateConfig({ providerId: id })}
        className="h-7! w-31 cursor-pointer pr-1.5 pl-2.5"
      />
    </div>
  )
}
