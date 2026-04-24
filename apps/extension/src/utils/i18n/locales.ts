import en from "@/locales/en.yml"
import ja from "@/locales/ja.yml"
import ko from "@/locales/ko.yml"
import ru from "@/locales/ru.yml"
import tr from "@/locales/tr.yml"
import vi from "@/locales/vi.yml"
import zhCN from "@/locales/zh-CN.yml"
import zhTW from "@/locales/zh-TW.yml"

export const SUPPORTED_UI_LOCALES = [
  "en",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "ru",
  "tr",
  "vi",
] as const

export type UILocale = typeof SUPPORTED_UI_LOCALES[number]

export type UILocalePreference = "auto" | UILocale

export const DEFAULT_UI_LOCALE: UILocale = "en"
export const DEFAULT_UI_LOCALE_PREFERENCE: UILocalePreference = "auto"

export type LocaleMessages = Record<string, unknown>

export const LOCALE_MESSAGES: Record<UILocale, LocaleMessages> = {
  "en": en as LocaleMessages,
  "zh-CN": zhCN as LocaleMessages,
  "zh-TW": zhTW as LocaleMessages,
  "ja": ja as LocaleMessages,
  "ko": ko as LocaleMessages,
  "ru": ru as LocaleMessages,
  "tr": tr as LocaleMessages,
  "vi": vi as LocaleMessages,
}

export const UI_LOCALE_NATIVE_LABELS: Record<UILocale, string> = {
  "en": "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  "ja": "日本語",
  "ko": "한국어",
  "ru": "Русский",
  "tr": "Türkçe",
  "vi": "Tiếng Việt",
}

export function isUILocale(value: unknown): value is UILocale {
  return typeof value === "string" && (SUPPORTED_UI_LOCALES as readonly string[]).includes(value)
}

export function isUILocalePreference(value: unknown): value is UILocalePreference {
  return value === "auto" || isUILocale(value)
}
