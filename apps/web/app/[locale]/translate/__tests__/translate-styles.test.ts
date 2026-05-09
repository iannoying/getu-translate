import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("translate page styles", () => {
  const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8")

  it("keeps model cards from shrinking inside the scrollable result list", () => {
    expect(styles).toMatch(/\.model-card\s*\{[^}]*flex:\s*0\s+0\s+auto;/s)
  })
})
