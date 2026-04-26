import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const customTranslationNodeCss = readFileSync(new URL("../custom-translation-node.css", import.meta.url), "utf8")

describe("custom-translation-node.css", () => {
  it("makes the default textColor preset match Immersive Translate's unthemed text style", () => {
    const textColorRule = customTranslationNodeCss.match(
      /\[data-read-frog-custom-translation-style="textColor"\]\s*\{[^}]+\}/,
    )?.[0]

    expect(textColorRule).toBeDefined()
    expect(textColorRule).toContain("color: inherit !important;")
    expect(textColorRule).toContain("font-feature-settings: normal;")
    expect(textColorRule).not.toContain("var(--read-frog-primary)")
  })
})
