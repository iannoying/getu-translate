import type { TranslateProviderConfig } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { cn } from "@/utils/styles/utils"

interface ProviderIconStackProps {
  providers: TranslateProviderConfig[]
  className?: string
}

function providerInitial(provider: TranslateProviderConfig): string {
  return provider.name.trim().charAt(0).toUpperCase() || "?"
}

function resolveProviderLogo(provider: TranslateProviderConfig, theme: string): string | undefined {
  const item = PROVIDER_ITEMS[provider.provider as keyof typeof PROVIDER_ITEMS]
  if (!item)
    return undefined

  try {
    return item.logo(theme as never)
  }
  catch {
    return undefined
  }
}

function ProviderIconOrFallback({
  provider,
  theme,
}: {
  provider: TranslateProviderConfig
  theme: string
}) {
  const logo = resolveProviderLogo(provider, theme)

  if (logo) {
    return (
      <ProviderIcon
        logo={logo}
        name={provider.name}
        size="sm"
        textClassName="sr-only"
      />
    )
  }

  return (
    <span
      className="bg-muted text-muted-foreground grid size-5 place-items-center rounded-full border border-border text-[10px] font-semibold"
      aria-label={provider.name}
      title={provider.name}
    >
      {providerInitial(provider)}
    </span>
  )
}

export function ProviderIconStack({ providers, className }: ProviderIconStackProps) {
  const { theme = "light" } = useTheme()
  const visibleProviders = providers.slice(0, 4)
  const overflowCount = providers.length - visibleProviders.length

  if (visibleProviders.length === 0)
    return null

  return (
    <div className={cn("flex items-center", className)}>
      {visibleProviders.map((provider, index) => (
        <span
          key={provider.id}
          className={cn(
            "bg-background grid size-7 place-items-center rounded-full ring-2 ring-background",
            index > 0 && "-ml-2",
          )}
        >
          <ProviderIconOrFallback provider={provider} theme={theme} />
        </span>
      ))}
      {overflowCount > 0 && (
        <span className="-ml-2 grid size-7 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-background">
          +
          {overflowCount}
        </span>
      )}
    </div>
  )
}
