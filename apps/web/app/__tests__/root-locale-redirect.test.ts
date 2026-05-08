import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const rootPageSource = readFileSync(resolve(__dirname, "../page.tsx"), "utf8")

describe("root locale redirect page", () => {
  it("uses the invisible synchronous redirect instead of the language chooser", () => {
    expect(rootPageSource).toContain("LegacyLocaleRedirectPage")
    expect(rootPageSource).not.toContain("root-locale-page")
    expect(rootPageSource).not.toContain("useEffect")
    expect(rootPageSource).not.toContain("LOCALE_LABELS")
  })
})
