import { describe, expect, it } from "vitest"
import {
  fromSidebarLanguageCode,
  SIDEBAR_SOURCE_LANGUAGES,
  SIDEBAR_TARGET_LANGUAGES,
  toSidebarLanguageCode,
} from "../language-options"

describe("language-options", () => {
  it("keeps auto only in source languages", () => {
    expect(SIDEBAR_SOURCE_LANGUAGES[0]).toEqual({ code: "auto", iso6393: "auto", labelKey: "translationWorkbench.languages.auto" })
    expect(SIDEBAR_TARGET_LANGUAGES.some(l => l.code === "auto")).toBe(false)
  })

  it("maps website-style language codes to extension ISO-639-3 codes", () => {
    expect(fromSidebarLanguageCode("auto")).toBe("auto")
    expect(fromSidebarLanguageCode("en")).toBe("eng")
    expect(fromSidebarLanguageCode("zh-CN")).toBe("cmn")
    expect(fromSidebarLanguageCode("zh-TW")).toBe("cmn-Hant")
    expect(fromSidebarLanguageCode("ja")).toBe("jpn")
  })

  it("maps extension ISO-639-3 codes back to website-style language codes", () => {
    expect(toSidebarLanguageCode("auto")).toBe("auto")
    expect(toSidebarLanguageCode("eng")).toBe("en")
    expect(toSidebarLanguageCode("cmn")).toBe("zh-CN")
    expect(toSidebarLanguageCode("cmn-Hant")).toBe("zh-TW")
    expect(toSidebarLanguageCode("kor")).toBe("ko")
  })

  it("does not silently map unsupported extension language codes to English", () => {
    expect(toSidebarLanguageCode("ita")).toBeUndefined()
  })
})
