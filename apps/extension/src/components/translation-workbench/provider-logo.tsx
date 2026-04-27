import type { AllProviderTypes, TranslateProviderConfig } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { cn } from "@/utils/styles/utils"

interface WorkbenchProviderLogoProps {
  provider: TranslateProviderConfig
  theme?: string
  size?: "sm" | "base" | "md"
  className?: string
  textClassName?: string
  iconOnly?: boolean
}

const textSizeClassName = {
  sm: "text-sm",
  base: "text-base",
  md: "text-md",
} satisfies Record<NonNullable<WorkbenchProviderLogoProps["size"]>, string>

export function resolveWorkbenchProviderLogo(
  provider: TranslateProviderConfig,
  theme: string,
): string | undefined {
  const item = PROVIDER_ITEMS[provider.provider as AllProviderTypes]
  if (!item)
    return undefined

  try {
    return item.logo(theme as never)
  }
  catch {
    return undefined
  }
}

export function getWorkbenchProviderInitial(provider: TranslateProviderConfig): string {
  return provider.name.trim().charAt(0).toUpperCase() || "?"
}

export function WorkbenchProviderLogo({
  provider,
  theme = "light",
  size = "sm",
  className,
  textClassName,
  iconOnly = false,
}: WorkbenchProviderLogoProps) {
  const logo = resolveWorkbenchProviderLogo(provider, theme)

  if (logo) {
    if (!iconOnly) {
      return (
        <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
          <ProviderIcon
            logo={logo}
            name=""
            size={size}
          />
          <span className={cn("truncate", textSizeClassName[size], textClassName)}>
            {provider.name}
          </span>
        </span>
      )
    }

    return (
      <ProviderIcon
        logo={logo}
        name={provider.name}
        size={size}
        className={className}
        textClassName={iconOnly ? "sr-only" : textClassName}
      />
    )
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span
        className="bg-muted text-muted-foreground grid size-5 shrink-0 place-items-center rounded-full border border-border text-[10px] font-semibold"
        aria-hidden={iconOnly ? undefined : true}
        aria-label={iconOnly ? provider.name : undefined}
        title={iconOnly ? provider.name : undefined}
      >
        {getWorkbenchProviderInitial(provider)}
      </span>
      {!iconOnly && (
        <span className={cn("truncate text-sm", textClassName)}>
          {provider.name}
        </span>
      )}
    </span>
  )
}
