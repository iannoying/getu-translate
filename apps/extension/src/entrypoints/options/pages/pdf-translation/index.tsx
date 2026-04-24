import { browser } from "#imports"
import { FREE_PDF_PAGES_PER_DAY } from "@getu/definitions"
import { Icon } from "@iconify/react"
import { liveQuery } from "dexie"
import { useAtom, useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/base-ui/button"
import { Label } from "@/components/ui/base-ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/base-ui/radio-group"
import { Switch } from "@/components/ui/base-ui/switch"
import { hasFeature, isPro } from "@/types/entitlements"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { db } from "@/utils/db/dexie/db"
import { getPdfPageUsage } from "@/utils/db/dexie/pdf-translation-usage"
import { clearPdfTranslations } from "@/utils/db/dexie/pdf-translations"
import { i18n } from "@/utils/i18n"
import { ConfigCard } from "../../components/config-card"
import { PageLayout } from "../../components/page-layout"

const ACTIVATION_MODES = ["always", "ask", "manual"] as const
type ActivationMode = (typeof ACTIVATION_MODES)[number]

function isActivationMode(value: string): value is ActivationMode {
  return (ACTIVATION_MODES as readonly string[]).includes(value)
}

/**
 * Build the browser's "extensions" URL for the current extension, used in the
 * guidance card when file:// access is disabled. For Chrome / Edge / most
 * Chromium forks this is `chrome://extensions/?id=<ext-id>`; we default to the
 * Chrome URL and fall back to just `chrome://extensions` when the extension id
 * is unavailable (e.g. test harness without `browser.runtime.id`).
 */
function getExtensionsUrl(): string {
  const id = browser.runtime?.id
  return id ? `chrome://extensions/?id=${id}` : "chrome://extensions"
}

function PdfTranslationEnabled() {
  const [config, setConfig] = useAtom(configFieldsAtomMap.pdfTranslation)

  return (
    <ConfigCard
      id="pdf-translation-enabled"
      title={i18n.t("options.pdfTranslation.enabled.label")}
      description={i18n.t("options.pdfTranslation.enabled.description")}
    >
      <div className="w-full flex justify-end">
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => {
            void setConfig({ enabled: checked })
          }}
        />
      </div>
    </ConfigCard>
  )
}

function PdfTranslationActivationMode() {
  const [config, setConfig] = useAtom(configFieldsAtomMap.pdfTranslation)

  return (
    <ConfigCard
      id="pdf-translation-activation-mode"
      title={i18n.t("options.pdfTranslation.activationMode.label")}
      description=""
    >
      <RadioGroup
        value={config.activationMode}
        onValueChange={(value) => {
          // RadioGroup types onValueChange's arg as `string`. Guard with the
          // runtime tuple so a typo in a <RadioGroupItem value="..." /> can't
          // silently persist a bogus activation mode into config storage.
          if (!isActivationMode(value))
            return
          void setConfig({ activationMode: value })
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start space-x-2">
          <RadioGroupItem value="always" id="pdf-activation-always" className="mt-1" />
          <Label htmlFor="pdf-activation-always" className="cursor-pointer">
            {i18n.t("options.pdfTranslation.activationMode.always")}
          </Label>
        </div>
        <div className="flex items-start space-x-2">
          <RadioGroupItem value="ask" id="pdf-activation-ask" className="mt-1" />
          <Label htmlFor="pdf-activation-ask" className="cursor-pointer">
            {i18n.t("options.pdfTranslation.activationMode.ask")}
          </Label>
        </div>
        <div className="flex items-start space-x-2">
          <RadioGroupItem value="manual" id="pdf-activation-manual" className="mt-1" />
          <Label htmlFor="pdf-activation-manual" className="cursor-pointer">
            {i18n.t("options.pdfTranslation.activationMode.manual")}
          </Label>
        </div>
      </RadioGroup>
    </ConfigCard>
  )
}

function PdfTranslationBlocklist() {
  const [config, setConfig] = useAtom(configFieldsAtomMap.pdfTranslation)
  const { blocklistDomains } = config

  const handleRemove = (domain: string) => {
    const next = blocklistDomains.filter(d => d !== domain)
    void setConfig({ blocklistDomains: next })
  }

  return (
    <ConfigCard
      id="pdf-translation-blocklist"
      title={i18n.t("options.pdfTranslation.blocklist.label")}
      description=""
    >
      {blocklistDomains.length === 0
        ? (
            <div className="text-sm text-muted-foreground">
              {i18n.t("options.pdfTranslation.blocklist.empty")}
            </div>
          )
        : (
            <ul className="flex flex-col gap-2">
              {blocklistDomains.map(domain => (
                <li
                  key={domain}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-mono truncate">{domain}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(domain)}
                  >
                    {i18n.t("options.pdfTranslation.blocklist.remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
    </ConfigCard>
  )
}

function PdfTranslationFileProtocol() {
  // `browser.extension.isAllowedFileSchemeAccess` is Chromium-only. Firefox
  // doesn't expose it — we guard with a typeof check and treat Firefox as
  // "unknown" (surface the guidance card with the Firefox-appropriate URL
  // resolved via getExtensionsUrl()).
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    // Cast to a zero-arg Promise-returning function — WXT's typing mirrors
    // the Chrome callback signature, but at runtime we invoke the modern
    // Promise form (available in Chrome / Edge / webextension-polyfill).
    const api = browser.extension?.isAllowedFileSchemeAccess as unknown as
      | (() => Promise<boolean>)
      | undefined
    if (typeof api !== "function") {
      setAllowed(false)
      return
    }
    let cancelled = false
    // Guard with try/catch: on Firefox / older Chrome builds the method may
    // throw synchronously instead of rejecting, and fake-browser in tests
    // is stubbed to throw "not implemented".
    try {
      Promise.resolve(api())
        .then((value) => {
          if (!cancelled)
            setAllowed(Boolean(value))
        })
        .catch(() => {
          if (!cancelled)
            setAllowed(false)
        })
    }
    catch {
      setAllowed(false)
    }
    return () => {
      cancelled = true
    }
  }, [])

  const extensionsUrl = getExtensionsUrl()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extensionsUrl)
      toast.success(extensionsUrl)
    }
    catch {
      toast.error(extensionsUrl)
    }
  }

  return (
    <ConfigCard
      id="pdf-translation-file-protocol"
      title={i18n.t("options.pdfTranslation.fileProtocol.label")}
      description=""
    >
      {allowed
        ? (
            <div className="flex items-center gap-2 text-sm">
              <Icon icon="tabler:circle-check" className="size-5 text-green-600" />
              <span>{i18n.t("options.pdfTranslation.fileProtocol.allowed")}</span>
            </div>
          )
        : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 text-sm">
                <Icon
                  icon="tabler:alert-triangle"
                  className="size-5 shrink-0 text-amber-600"
                />
                <span>{i18n.t("options.pdfTranslation.fileProtocol.disabled")}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1 text-xs">
                  {extensionsUrl}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                  {i18n.t("options.pdfTranslation.fileProtocol.copyUrl")}
                </Button>
              </div>
            </div>
          )}
    </ConfigCard>
  )
}

/**
 * Today's PDF-page translation usage. Shows `N / 50` for Free users and
 * `N / unlimited` for Pro / Enterprise with `pdf_translate_unlimited`.
 *
 * The counter lives in Dexie (`pdfTranslationUsage`) and is bumped by the
 * scheduler on successful translate. We subscribe via `liveQuery` so the
 * badge reflects freshly-consumed pages without a manual refresh.
 */
function PdfTranslationUsage() {
  const [used, setUsed] = useState(0)
  const entitlements = useAtomValue(entitlementsAtom)
  const isUnlimited
    = isPro(entitlements) && hasFeature(entitlements, "pdf_translate_unlimited")

  useEffect(() => {
    const subscription = liveQuery(() => getPdfPageUsage()).subscribe({
      next: (n) => {
        setUsed(n)
      },
      error: () => {
        // Swallow — the Dexie connection may still be opening on first
        // mount; next emission will correct the count.
      },
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const limitText = isUnlimited
    ? i18n.t("options.pdfTranslation.usage.unlimited")
    : String(FREE_PDF_PAGES_PER_DAY)

  return (
    <ConfigCard
      id="pdf-translation-usage"
      title={i18n.t("options.pdfTranslation.usage.title")}
      description={i18n.t("options.pdfTranslation.usage.description")}
    >
      <div className="text-sm font-mono">
        {used}
        {" "}
        /
        {" "}
        {limitText}
      </div>
    </ConfigCard>
  )
}

/**
 * Cache management card. Shows the live count of cached pages and exposes
 * a "Clear cache" button (guarded by `confirm()`) that wipes the
 * `pdfTranslations` table via the existing `clearPdfTranslations` helper.
 *
 * The counter uses `liveQuery` so removing rows elsewhere (e.g. LRU
 * eviction alarm) updates the display without remounting the page.
 */
function PdfTranslationCache() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const subscription = liveQuery(() => db.pdfTranslations.count()).subscribe({
      next: (n) => {
        setCount(n)
      },
      error: () => {
        // Swallow — see PdfTranslationUsage for rationale.
      },
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleClear = async () => {
    // Use native `confirm` rather than a custom dialog — this matches the
    // weight of the action (single-click destructive).
    // eslint-disable-next-line no-alert
    if (!globalThis.confirm(i18n.t("options.pdfTranslation.cache.clearConfirm")))
      return
    try {
      await clearPdfTranslations()
    }
    catch {
      // Swallow — liveQuery will refresh the count on next tick either way.
    }
  }

  const countText = count === 1
    ? i18n.t("options.pdfTranslation.cache.countOne", [String(count)])
    : i18n.t("options.pdfTranslation.cache.countMany", [String(count)])

  return (
    <ConfigCard
      id="pdf-translation-cache"
      title={i18n.t("options.pdfTranslation.cache.title")}
      description={i18n.t("options.pdfTranslation.cache.description")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">{countText}</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleClear}
          disabled={count === 0}
        >
          {i18n.t("options.pdfTranslation.cache.clear")}
        </Button>
      </div>
    </ConfigCard>
  )
}

export function PdfTranslationPage() {
  return (
    <PageLayout title={i18n.t("options.pdfTranslation.title")}>
      <div className="*:border-b [&>*:last-child]:border-b-0">
        <PdfTranslationEnabled />
        <PdfTranslationActivationMode />
        <PdfTranslationBlocklist />
        <PdfTranslationFileProtocol />
        <PdfTranslationUsage />
        <PdfTranslationCache />
      </div>
    </PageLayout>
  )
}
