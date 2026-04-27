import type { TranslationRequestSnapshot, TranslationResultState } from "@/components/translation-workbench/types"
import type { Config } from "@/types/config/config"
import type { TranslateProviderConfig } from "@/types/config/provider"
import { IconCornerDownLeft } from "@tabler/icons-react"
import { useAtom, useAtomValue } from "jotai"
import { useEffect, useEffectEvent, useMemo, useState } from "react"
import { toast } from "sonner"
import { WorkbenchLanguagePicker } from "@/components/translation-workbench/language-picker"
import { getTextTranslateCharLimit, isGetuProProvider, planFromEntitlements } from "@/components/translation-workbench/provider-gating"
import { ProviderMultiSelect } from "@/components/translation-workbench/provider-multi-select"
import { TranslationWorkbenchResultCard } from "@/components/translation-workbench/result-card"
import { runTranslationWorkbenchRequest } from "@/components/translation-workbench/translate-runner"
import { useAuthRefreshOnFocus } from "@/components/translation-workbench/use-auth-refresh"
import { Button } from "@/components/ui/base-ui/button"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { useEntitlements } from "@/hooks/use-entitlements"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { authClient } from "@/utils/auth/auth-client"
import { filterEnabledProvidersConfig, getTranslateProvidersConfig } from "@/utils/config/helpers"
import { WEBSITE_URL } from "@/utils/constants/url"
import { swallowExtensionLifecycleError } from "@/utils/extension-lifecycle"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { shadowWrapper } from "../../index"

function createClickId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID()

  return `${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function resolvePortalContainer(): HTMLElement {
  return shadowWrapper ?? document.body
}

interface PendingSidebarTranslation {
  providerIds: string[]
  request: TranslationRequestSnapshot
  languageLevel: Config["language"]["level"]
}

export function SidebarTextTab() {
  const [language, setLanguage] = useAtom(configFieldsAtomMap.language)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const session = authClient.useSession()
  const sessionLoading = session?.isPending ?? false
  const userId = session.data?.user?.id ?? null
  useAuthRefreshOnFocus(userId, session.refetch)
  const { data: entitlements, isLoading: entitlementsLoading } = useEntitlements(userId)
  const plan = planFromEntitlements(userId, entitlements)
  const charLimit = getTextTranslateCharLimit(plan)
  const authGateLoading = sessionLoading || entitlementsLoading

  const providers = useMemo<TranslateProviderConfig[]>(
    () => filterEnabledProvidersConfig(getTranslateProvidersConfig(providersConfig)) as TranslateProviderConfig[],
    [providersConfig],
  )

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null)
  const [text, setText] = useState("")
  const [results, setResults] = useState<Record<string, TranslationResultState>>({})
  const [isTranslating, setIsTranslating] = useState(false)
  const [pendingTranslation, setPendingTranslation] = useState<PendingSidebarTranslation | null>(null)
  const portalContainer = resolvePortalContainer()
  const selectedProviderIds = useMemo(() => {
    const providerIds = new Set(providers.map(provider => provider.id))
    const baseIds = selectedIds ?? providers.slice(0, 3).map(provider => provider.id)

    return baseIds.filter(id => providerIds.has(id))
  }, [providers, selectedIds])
  const selectedProviders = selectedProviderIds
    .map(id => providers.find(provider => provider.id === id))
    .filter((provider): provider is TranslateProviderConfig => provider !== undefined)
  const overLimit = text.length > charLimit
  const isBusy = isTranslating || pendingTranslation !== null

  function swapLanguages() {
    if (language.sourceCode === "auto")
      return

    void setLanguage({
      ...language,
      sourceCode: language.targetCode,
      targetCode: language.sourceCode,
    })
  }

  function getProvidersByIds(providerIds: string[]) {
    return providerIds
      .map(id => providers.find(provider => provider.id === id))
      .filter((provider): provider is TranslateProviderConfig => provider !== undefined)
  }

  function shouldWaitForProviderGate(providersToRun: TranslateProviderConfig[]) {
    return authGateLoading && providersToRun.some(isGetuProProvider)
  }

  function setLoadingResults(providersToRun: TranslateProviderConfig[]) {
    setResults((current) => {
      const next = { ...current }
      for (const provider of providersToRun) {
        next[provider.id] = { providerId: provider.id, status: "loading" }
      }
      return next
    })
  }

  async function translate(providerIds = selectedProviderIds, pending?: PendingSidebarTranslation) {
    if (!pending && (!text.trim() || overLimit || isBusy))
      return

    const providersToRun = getProvidersByIds(providerIds)

    if (providersToRun.length === 0) {
      if (pending)
        setPendingTranslation(null)
      return
    }

    const request = pending?.request ?? {
      text: text.trim(),
      sourceLanguage: language.sourceCode,
      targetLanguage: language.targetCode,
      clickId: createClickId(),
    }
    const languageLevel = pending?.languageLevel ?? language.level

    if (shouldWaitForProviderGate(providersToRun)) {
      setLoadingResults(providersToRun)
      setPendingTranslation({ providerIds, request, languageLevel })
      return
    }

    setPendingTranslation(null)
    setIsTranslating(true)
    setLoadingResults(providersToRun)

    try {
      const nextResults = await runTranslationWorkbenchRequest({
        plan,
        userId,
        request,
        providers: providersToRun,
        languageLevel,
      })

      setResults((current) => {
        const next = { ...current }
        for (const result of nextResults) {
          next[result.providerId] = result
        }
        return next
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : i18n.t("translationWorkbench.errorFallback")
      toast.error(message)
      setResults((current) => {
        const next = { ...current }
        for (const provider of providersToRun) {
          next[provider.id] = {
            providerId: provider.id,
            status: "error",
            errorMessage: message,
          }
        }
        return next
      })
    }
    finally {
      setIsTranslating(false)
    }
  }

  const continuePendingTranslation = useEffectEvent((pending: PendingSidebarTranslation) => {
    void translate(pending.providerIds, pending)
  })

  useEffect(() => {
    if (pendingTranslation === null || authGateLoading)
      return

    continuePendingTranslation(pendingTranslation)
  }, [pendingTranslation, authGateLoading])

  function login() {
    void sendMessage("openPage", { url: `${WEBSITE_URL}/log-in?redirect=/` })
      .catch(swallowExtensionLifecycleError("sidebar text login"))
  }

  function upgrade() {
    void sendMessage("openPage", { url: `${WEBSITE_URL}/pricing` })
      .catch(swallowExtensionLifecycleError("sidebar text upgrade"))
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-normal">
              {i18n.t("translationWorkbench.textTitle")}
            </h2>
          </div>

          <ProviderMultiSelect
            providers={providers}
            selectedIds={selectedProviderIds}
            onSelectedIdsChange={setSelectedIds}
            portalContainer={portalContainer}
          />
        </div>

        <WorkbenchLanguagePicker
          source={language.sourceCode}
          target={language.targetCode}
          onSourceChange={sourceCode => void setLanguage({ ...language, sourceCode })}
          onTargetChange={targetCode => void setLanguage({ ...language, targetCode })}
          onSwap={swapLanguages}
          portalContainer={portalContainer}
        />
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="relative">
          <Textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={i18n.t("translationWorkbench.inputPlaceholder")}
            className="h-56 resize-none rounded-none border-0 bg-background p-4 pb-14 text-base shadow-none"
            style={{ userSelect: "text" }}
          />
          <div className="absolute bottom-3 left-4 text-xs text-muted-foreground">
            <span className={overLimit ? "text-destructive" : undefined}>{text.length}</span>
            {" "}
            /
            {" "}
            {charLimit}
          </div>
          <Button
            type="button"
            className="absolute right-3 bottom-3 h-9 gap-2 px-4 text-sm font-semibold"
            disabled={!text.trim() || overLimit || selectedProviderIds.length === 0 || isBusy}
            onClick={() => void translate()}
          >
            {isBusy ? i18n.t("translationWorkbench.loading") : i18n.t("translationWorkbench.translate")}
            <IconCornerDownLeft className="size-4" />
          </Button>
        </div>
      </section>

      {overLimit && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {i18n.t("translationWorkbench.charLimitExceeded", charLimit)}
        </p>
      )}

      {providers.length === 0 && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {i18n.t("translationWorkbench.noProviders")}
        </p>
      )}

      {selectedProviders.length > 0 && (
        <div className="space-y-3">
          {selectedProviders.map(provider => (
            <TranslationWorkbenchResultCard
              key={provider.id}
              provider={provider}
              result={results[provider.id] ?? { providerId: provider.id, status: "idle" }}
              onRetry={providerId => void translate([providerId])}
              onLogin={login}
              onUpgrade={upgrade}
            />
          ))}
        </div>
      )}
    </div>
  )
}
