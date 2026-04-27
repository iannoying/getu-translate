import type { TranslateProviderConfig } from "@/types/config/provider"
import { IconCheck, IconChevronDown } from "@tabler/icons-react"
import { useTheme } from "@/components/providers/theme-provider"
import { Button } from "@/components/ui/base-ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/base-ui/popover"
import { isLLMProviderConfig, isPureAPIProviderConfig } from "@/types/config/provider"
import { i18n } from "@/utils/i18n"
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

  function toggleProvider(providerId: string) {
    if (selectedIds.includes(providerId)) {
      if (selectedIds.length <= 1)
        return
      onSelectedIdsChange(selectedIds.filter(id => id !== providerId))
      return
    }

    onSelectedIdsChange([...selectedIds, providerId])
  }

  return (
    <Popover>
      <PopoverTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            aria-label={i18n.t("translationWorkbench.selectProviders")}
            className="h-10 min-w-36 rounded-full border-0 bg-muted px-3 shadow-none hover:bg-muted/80"
          >
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
            <IconChevronDown className="size-4 text-muted-foreground" />
          </Button>
        )}
      />
      <PopoverContent
        container={portalContainer}
        align="end"
        sideOffset={8}
        positionerClassName="z-[2147483647]"
        className="z-[2147483647] max-h-[min(28rem,var(--available-height))] w-80 overflow-y-auto p-2"
      >
        <div role="group" aria-label={i18n.t("translationWorkbench.selectProviders")} className="space-y-2">
          {providerGroups.map(group => (
            <section key={group.id} className="space-y-1">
              <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {i18n.t(group.labelKey)}
              </h3>
              {group.providers.map((provider) => {
                const checked = selectedIds.includes(provider.id)
                return (
                  <label
                    key={provider.id}
                    className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-within:bg-muted"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        className="peer sr-only"
                        onChange={() => toggleProvider(provider.id)}
                      />
                      <span className="grid size-4 place-items-center rounded border border-border">
                        {checked && <IconCheck className="size-3" aria-hidden="true" />}
                      </span>
                      <WorkbenchProviderLogo provider={provider} theme={theme} size="sm" />
                    </span>
                    {isGetuProProvider(provider) && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Pro
                      </span>
                    )}
                  </label>
                )
              })}
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
