import type { TranslateProviderConfig } from "@/types/config/provider"
import { useTheme } from "@/components/providers/theme-provider"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { isLLMProviderConfig, isPureAPIProviderConfig } from "@/types/config/provider"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"
import { isGetuProProvider } from "./provider-gating"
import { ProviderIconStack } from "./provider-icon-stack"
import { WorkbenchProviderLogo } from "./provider-logo"

interface ProviderMultiSelectProps {
  providers: TranslateProviderConfig[]
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  portalContainer: HTMLElement
}

interface ProviderGroup {
  id: "free" | "pro" | "byok" | "api"
  labelKey: string
  providers: TranslateProviderConfig[]
}

const FREE_REST_PROVIDER_TYPES = new Set([
  "google-translate",
  "microsoft-translate",
  "bing-translate",
  "yandex-translate",
])

function getProviderGroups(providers: TranslateProviderConfig[]): ProviderGroup[] {
  const free: TranslateProviderConfig[] = []
  const pro: TranslateProviderConfig[] = []
  const byok: TranslateProviderConfig[] = []
  const api: TranslateProviderConfig[] = []

  for (const provider of providers) {
    if (FREE_REST_PROVIDER_TYPES.has(provider.provider)) {
      free.push(provider)
    }
    else if (isGetuProProvider(provider)) {
      pro.push(provider)
    }
    else if (isLLMProviderConfig(provider)) {
      byok.push(provider)
    }
    else if (isPureAPIProviderConfig(provider)) {
      api.push(provider)
    }
    else {
      api.push(provider)
    }
  }

  const groups: ProviderGroup[] = [
    { id: "free", labelKey: "translationWorkbench.freeProviders", providers: free },
    { id: "pro", labelKey: "translationWorkbench.proProviders", providers: pro },
    { id: "byok", labelKey: "translationWorkbench.byokProviders", providers: byok },
    { id: "api", labelKey: "translationWorkbench.apiProviders", providers: api },
  ]

  return groups.filter(group => group.providers.length > 0)
}

export function ProviderMultiSelect({
  providers,
  selectedIds,
  onSelectedIdsChange,
  portalContainer,
}: ProviderMultiSelectProps) {
  const { theme = "light" } = useTheme()
  const selectedProviders = selectedIds
    .map(id => providers.find(provider => provider.id === id))
    .filter((provider): provider is TranslateProviderConfig => provider !== undefined)
  const providerGroups = getProviderGroups(providers)

  return (
    <Select
      multiple
      value={selectedIds}
      onValueChange={onSelectedIdsChange}
    >
      <SelectTrigger className="h-10 min-w-36 rounded-full border-0 bg-muted px-3 shadow-none">
        <SelectValue placeholder={i18n.t("translationWorkbench.selectProviders")}>
          {selectedProviders.length > 0
            ? (
                <span className="flex min-w-0 items-center gap-2">
                  <ProviderIconStack providers={selectedProviders} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {selectedProviders.length}
                  </span>
                </span>
              )
            : (
                <span className="truncate text-muted-foreground">
                  {i18n.t("translationWorkbench.selectProviders")}
                </span>
              )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent container={portalContainer} className="w-72">
        {providerGroups.map(group => (
          <SelectGroup key={group.id}>
            <SelectLabel>{i18n.t(group.labelKey)}</SelectLabel>
            {group.providers.map(provider => (
              <SelectItem key={provider.id} value={provider.id}>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <WorkbenchProviderLogo provider={provider} theme={theme} size="sm" />
                  {isGetuProProvider(provider) && (
                    <span className={cn("rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary")}>
                      Pro
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
