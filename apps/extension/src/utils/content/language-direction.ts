import type { LangCodeISO6393 } from "@getu/definitions"
import { ISO6393_TO_6391, RTL_LANG_CODES } from "@getu/definitions"

interface LanguageDirectionAndLang {
  dir: "ltr" | "rtl"
  lang?: string
}

export function getLanguageDirectionAndLang(targetCode: LangCodeISO6393): LanguageDirectionAndLang {
  const dir = RTL_LANG_CODES.includes(targetCode as typeof RTL_LANG_CODES[number]) ? "rtl" : "ltr"
  const lang = ISO6393_TO_6391[targetCode]

  return { dir, lang }
}
