import { browser, i18n } from "#imports"
import { Icon } from "@iconify/react"
import { useAtom } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/base-ui/button"
import { Label } from "@/components/ui/base-ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/base-ui/radio-group"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
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

export function PdfTranslationPage() {
  return (
    <PageLayout title={i18n.t("options.pdfTranslation.title")}>
      <div className="*:border-b [&>*:last-child]:border-b-0">
        <PdfTranslationEnabled />
        <PdfTranslationActivationMode />
        <PdfTranslationBlocklist />
        <PdfTranslationFileProtocol />
      </div>
    </PageLayout>
  )
}
