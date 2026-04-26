import { describe, expect, it } from "vitest"
import { extractTextFromPdf } from "../pdf-extract"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(__dirname, "fixtures")

describe("extractTextFromPdf", () => {
  it("extracts text from a regular PDF page-by-page", async () => {
    const buf = readFileSync(resolve(FIXTURES, "hello-world.pdf"))
    const result = await extractTextFromPdf(buf)
    expect(result.scanned).toBe(false)
    expect(result.totalPages).toBe(2)
    expect(result.pages.length).toBe(2)
    expect(result.pages[0].pageNumber).toBe(1)
    expect(result.pages[0].text).toContain("Hello")
    // Empty page 2 may have empty or whitespace text — but it should be present
    expect(result.pages[1].pageNumber).toBe(2)
  })

  it("flags a scanned PDF (no extractable text)", async () => {
    const buf = readFileSync(resolve(FIXTURES, "scanned-image.pdf"))
    const result = await extractTextFromPdf(buf)
    expect(result.scanned).toBe(true)
    expect(result.pages.every((p) => p.text.trim().length === 0)).toBe(true)
  })

  it("returns the same total page count as the input PDF", async () => {
    const buf = readFileSync(resolve(FIXTURES, "hello-world.pdf"))
    const result = await extractTextFromPdf(buf)
    expect(result.totalPages).toBe(result.pages.length)
  })
})
