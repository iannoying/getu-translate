import { browser } from "#imports"
import { describe, expect, it, vi } from "vitest"
import { CJK_FONT_PATH, getCjkFontUrl } from "../font-path"

describe("cJK_FONT_PATH", () => {
  it("points at the subsetted Noto Sans CJK SC file under public/assets/fonts", () => {
    expect(CJK_FONT_PATH).toBe("/assets/fonts/noto-sans-cjk-sc-subset.otf")
  })

  it("is extension-root-relative (starts with a single leading slash)", () => {
    expect(CJK_FONT_PATH.startsWith("/")).toBe(true)
    expect(CJK_FONT_PATH.startsWith("//")).toBe(false)
  })
})

describe("getCjkFontUrl", () => {
  it("resolves CJK_FONT_PATH through browser.runtime.getURL", () => {
    // WxtVitest wires `#imports` to a `fakeBrowser`; spy on its `getURL` so
    // we assert the helper forwards the canonical path rather than
    // hard-coding whichever ext-id the fake uses.
    const spy = vi
      .spyOn(browser.runtime, "getURL")
      .mockReturnValue(`chrome-extension://fake-ext-id${CJK_FONT_PATH}`)

    expect(getCjkFontUrl()).toBe(
      `chrome-extension://fake-ext-id${CJK_FONT_PATH}`,
    )
    expect(spy).toHaveBeenCalledWith(CJK_FONT_PATH)

    spy.mockRestore()
  })

  it("returns a chrome-extension:// URL ending with the font path (real fakeBrowser)", () => {
    const url = getCjkFontUrl()
    expect(url.startsWith("chrome-extension://")).toBe(true)
    expect(url.endsWith(CJK_FONT_PATH)).toBe(true)
  })
})
