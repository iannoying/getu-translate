import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/constants/url", () => ({
  WEB_DOCUMENT_TRANSLATE_URL: "https://example.test/document/",
}))

const { buildWebTranslateUrl, isPdfLikeUrl } = await import("../pdf-detection")

describe("isPdfLikeUrl", () => {
  it("returns true for URLs whose path ends with .pdf", () => {
    expect(isPdfLikeUrl("https://example.com/whitepaper.pdf")).toBe(true)
    expect(isPdfLikeUrl("https://example.com/Foo.PDF")).toBe(true)
    expect(isPdfLikeUrl("file:///tmp/local.pdf")).toBe(true)
  })

  it("returns false when only the query / fragment contains .pdf", () => {
    expect(isPdfLikeUrl("https://example.com/page?download=foo.pdf")).toBe(false)
    expect(isPdfLikeUrl("https://example.com/page#foo.pdf")).toBe(false)
  })

  it("returns true for arxiv extensionless PDF URLs", () => {
    expect(isPdfLikeUrl("https://arxiv.org/pdf/2507.15551")).toBe(true)
    expect(isPdfLikeUrl("https://arxiv.org/pdf/2403.01234v2")).toBe(true)
  })

  it("returns true for openreview /pdf?id=... URLs", () => {
    expect(isPdfLikeUrl("https://openreview.net/pdf?id=abc123")).toBe(true)
  })

  it("returns false for arxiv abstract pages", () => {
    expect(isPdfLikeUrl("https://arxiv.org/abs/2507.15551")).toBe(false)
  })

  it("returns false for unrelated URLs", () => {
    expect(isPdfLikeUrl("https://example.com/")).toBe(false)
    expect(isPdfLikeUrl("https://example.com/page.html")).toBe(false)
  })

  it("returns false for malformed URLs", () => {
    expect(isPdfLikeUrl("not a url")).toBe(false)
    expect(isPdfLikeUrl("")).toBe(false)
  })
})

describe("buildWebTranslateUrl", () => {
  it("appends ?src=<encoded> to the configured base URL", () => {
    expect(buildWebTranslateUrl("https://arxiv.org/pdf/2507.15551")).toBe(
      "https://example.test/document/?src=https%3A%2F%2Farxiv.org%2Fpdf%2F2507.15551",
    )
  })

  it("uRL-encodes special characters in the source", () => {
    expect(buildWebTranslateUrl("https://example.com/file.pdf?a=1&b=2")).toBe(
      "https://example.test/document/?src=https%3A%2F%2Fexample.com%2Ffile.pdf%3Fa%3D1%26b%3D2",
    )
  })
})
