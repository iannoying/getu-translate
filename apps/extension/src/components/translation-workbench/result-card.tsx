import type { TranslationResultState } from "./types"
import type { TranslateProviderConfig } from "@/types/config/provider"
import { IconAlertTriangle, IconCopy, IconLoader2, IconRefresh } from "@tabler/icons-react"
import { toast } from "sonner"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { Button } from "@/components/ui/base-ui/button"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"

interface TranslationWorkbenchResultCardProps {
  provider: TranslateProviderConfig
  result: TranslationResultState
  onRetry: (providerId: string) => void
  onLogin: () => void
  onUpgrade: () => void
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

function ProviderHeaderIcon({ provider, theme }: { provider: TranslateProviderConfig, theme: string }) {
  const logo = resolveProviderLogo(provider, theme)

  if (logo)
    return <ProviderIcon logo={logo} name={provider.name} size="sm" />

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="bg-muted text-muted-foreground grid size-5 shrink-0 place-items-center rounded-full border border-border text-[10px] font-semibold">
        {providerInitial(provider)}
      </span>
      <span className="truncate text-sm">{provider.name}</span>
    </span>
  )
}

export function TranslationWorkbenchResultCard({
  provider,
  result,
  onRetry,
  onLogin,
  onUpgrade,
}: TranslationWorkbenchResultCardProps) {
  const { theme = "light" } = useTheme()

  async function copyResult() {
    if (!result.text)
      return

    if (typeof navigator.clipboard?.writeText !== "function") {
      toast.error(i18n.t("translationWorkbench.copyFailed"))
      return
    }

    try {
      await navigator.clipboard.writeText(result.text)
      toast.success(i18n.t("translationWorkbench.copied"))
    }
    catch {
      toast.error(i18n.t("translationWorkbench.copyFailed"))
    }
  }

  const canRetry = result.status === "error" || result.status === "quota-exhausted"

  return (
    <article className="rounded-md border border-border bg-card p-4 text-card-foreground">
      <header className="mb-3 flex items-center justify-between gap-3">
        <ProviderHeaderIcon provider={provider} theme={theme} />
        <div className="flex items-center gap-1">
          {result.status === "loading" && (
            <IconLoader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          {result.status === "success" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={i18n.t("translationWorkbench.copyResult")}
              onClick={() => void copyResult()}
            >
              <IconCopy className="size-4" />
            </Button>
          )}
          {canRetry && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={i18n.t("translationWorkbench.retry")}
              onClick={() => onRetry(provider.id)}
            >
              <IconRefresh className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {result.status === "idle" && (
        <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.idle")}</p>
      )}

      {result.status === "loading" && (
        <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.loading")}</p>
      )}

      {result.status === "success" && (
        <p className="whitespace-pre-wrap text-base leading-relaxed">{result.text}</p>
      )}

      {result.status === "error" && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{result.errorMessage ?? i18n.t("translationWorkbench.errorFallback")}</p>
        </div>
      )}

      {result.status === "quota-exhausted" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {result.errorMessage ?? i18n.t("translationWorkbench.quotaExhausted")}
          </p>
          <Button type="button" size="sm" onClick={onUpgrade}>
            {i18n.t("translationWorkbench.upgradeAction")}
          </Button>
        </div>
      )}

      {result.status === "login-required" && (
        <div className="space-y-3 rounded-md bg-muted p-4 text-center">
          <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.loginRequired")}</p>
          <Button type="button" size="sm" onClick={onLogin}>
            {i18n.t("translationWorkbench.loginAction")}
          </Button>
        </div>
      )}

      {result.status === "upgrade-required" && (
        <div className="space-y-3 rounded-md bg-primary/10 p-4 text-center">
          <p className="text-sm text-muted-foreground">{i18n.t("translationWorkbench.upgradeRequired")}</p>
          <Button type="button" size="sm" onClick={onUpgrade}>
            {i18n.t("translationWorkbench.upgradeAction")}
          </Button>
        </div>
      )}
    </article>
  )
}
