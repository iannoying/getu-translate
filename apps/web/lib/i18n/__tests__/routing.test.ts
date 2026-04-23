import { describe, expect, it } from "vitest"
import { localeHref, switchLocalePath } from "../routing"

describe("web i18n routing", () => {
  it("builds locale-prefixed hrefs with trailing slash friendly paths", () => {
    expect(localeHref("en", "/")).toBe("/en/")
    expect(localeHref("zh-CN", "/price")).toBe("/zh-CN/price/")
    expect(localeHref("zh-TW", "privacy")).toBe("/zh-TW/privacy/")
  })

  it("switches locale while preserving known pages", () => {
    expect(switchLocalePath("/en/price/", "zh-CN")).toBe("/zh-CN/price/")
    expect(switchLocalePath("/zh-CN/log-in/", "en")).toBe("/en/log-in/")
    expect(switchLocalePath("/zh-TW/upgrade/success/", "zh-CN")).toBe("/zh-CN/upgrade/success/")
  })

  it("maps legacy unprefixed pages to the target locale", () => {
    expect(switchLocalePath("/price/", "zh-TW")).toBe("/zh-TW/price/")
    expect(switchLocalePath("/privacy", "zh-CN")).toBe("/zh-CN/privacy/")
  })

  it("falls back to target locale home for unknown paths", () => {
    expect(switchLocalePath("/en/unknown/", "zh-CN")).toBe("/zh-CN/")
    expect(switchLocalePath("/totally-custom", "en")).toBe("/en/")
  })
})
