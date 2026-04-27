import type { TranslateProviderConfig } from "@/types/config/provider"
import { useTheme } from "@/components/providers/theme-provider"
import { cn } from "@/utils/styles/utils"
import { WorkbenchProviderLogo } from "./provider-logo"

interface ProviderIconStackProps {
  providers: TranslateProviderConfig[]
  className?: string
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
          <WorkbenchProviderLogo provider={provider} theme={theme} size="sm" iconOnly />
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
