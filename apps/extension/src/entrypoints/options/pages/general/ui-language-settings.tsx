import type { UILocale, UILocalePreference } from "@/utils/i18n"
import { Icon } from "@iconify/react"
import { useAtom } from "jotai"
import { useMemo } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import {
  detectBrowserUILocale,
  i18n,
  SUPPORTED_UI_LOCALES,
  UI_LOCALE_NATIVE_LABELS,
  uiLocalePreferenceAtom,
} from "@/utils/i18n"
import { ConfigCard } from "../../components/config-card"

const PREFERENCE_ORDER = ["auto", ...SUPPORTED_UI_LOCALES] as const satisfies readonly UILocalePreference[]

function renderLabel(pref: UILocalePreference, autoResolvedLocale: UILocale): string {
  if (pref === "auto") {
    // "Auto (English)" etc., so users can see which concrete locale auto
    // is currently resolving to before they commit to an override.
    return `${i18n.t("options.general.uiLanguage.auto")} (${UI_LOCALE_NATIVE_LABELS[autoResolvedLocale]})`
  }
  return UI_LOCALE_NATIVE_LABELS[pref]
}

export default function UILanguageSettings() {
  const [preference, setPreference] = useAtom(uiLocalePreferenceAtom)
  // Detect once per mount; the browser UI language does not change while the
  // settings page is open, so it is safe to memoise with an empty deps list.
  const autoResolvedLocale = useMemo(() => detectBrowserUILocale(), [])

  return (
    <ConfigCard
      id="ui-language"
      title={i18n.t("options.general.uiLanguage.title")}
      description={i18n.t("options.general.uiLanguage.description")}
    >
      <div className="w-full flex justify-start md:justify-end">
        <Select
          value={preference}
          onValueChange={value => void setPreference(value as UILocalePreference)}
        >
          <SelectTrigger className="w-full">
            <SelectValue render={<span />}>
              <span className="flex items-center gap-2">
                <Icon icon="tabler:language" className="size-4" />
                {renderLabel(preference, autoResolvedLocale)}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PREFERENCE_ORDER.map(pref => (
                <SelectItem key={pref} value={pref}>
                  <span className="flex items-center gap-2">
                    <Icon
                      icon={pref === "auto" ? "tabler:world" : "tabler:language"}
                      className="size-4"
                    />
                    {renderLabel(pref, autoResolvedLocale)}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </ConfigCard>
  )
}
