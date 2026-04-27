import type { LangCodeISO6393 } from "@getu/definitions"

export type SidebarLanguageCode = "auto" | "en" | "zh-CN" | "zh-TW" | "ja" | "ko" | "fr" | "de" | "es" | "ru"

export interface SidebarLanguageOption {
  code: SidebarLanguageCode
  iso6393: LangCodeISO6393 | "auto"
  labelKey: string
}

export const SIDEBAR_SOURCE_LANGUAGES: SidebarLanguageOption[] = [
  { code: "auto", iso6393: "auto", labelKey: "translationWorkbench.languages.auto" },
  { code: "en", iso6393: "eng", labelKey: "languages.eng" },
  { code: "zh-CN", iso6393: "cmn", labelKey: "languages.cmn" },
  { code: "zh-TW", iso6393: "cmn-Hant", labelKey: "languages.cmnHant" },
  { code: "ja", iso6393: "jpn", labelKey: "languages.jpn" },
  { code: "ko", iso6393: "kor", labelKey: "languages.kor" },
  { code: "fr", iso6393: "fra", labelKey: "languages.fra" },
  { code: "de", iso6393: "deu", labelKey: "languages.deu" },
  { code: "es", iso6393: "spa", labelKey: "languages.spa" },
  { code: "ru", iso6393: "rus", labelKey: "languages.rus" },
]

export const SIDEBAR_TARGET_LANGUAGES = SIDEBAR_SOURCE_LANGUAGES.filter(l => l.code !== "auto")

export function fromSidebarLanguageCode(code: SidebarLanguageCode): LangCodeISO6393 | "auto" {
  return SIDEBAR_SOURCE_LANGUAGES.find(l => l.code === code)?.iso6393 ?? "eng"
}

export function toSidebarLanguageCode(code: LangCodeISO6393 | "auto"): SidebarLanguageCode | undefined {
  return SIDEBAR_SOURCE_LANGUAGES.find(l => l.iso6393 === code)?.code
}
