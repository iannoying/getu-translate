import { describe, expect, it } from "vitest"
import { chunkParagraphs } from "../document-chunker"

describe("chunkParagraphs", () => {
  it("merges short paragraphs up to ~1500 chars", () => {
    const text = "Para1.\n\nPara2.\n\nPara3.\n\n" + "x".repeat(200)
    const chunks = chunkParagraphs([{ pageNumber: 1, text }])
    expect(chunks.length).toBe(1)
    expect(chunks[0].text).toContain("Para1")
    expect(chunks[0].text).toContain("Para3")
    expect(chunks[0].startPage).toBe(1)
    expect(chunks[0].endPage).toBe(1)
  })

  it("splits a long paragraph at sentence boundary", () => {
    const sent = "This is a sentence. ".repeat(100) // ~2000 chars
    const chunks = chunkParagraphs([{ pageNumber: 1, text: sent }])
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1500)
      // Each chunk should END on a sentence boundary
      expect(c.text.trim()).toMatch(/[.!?]$/)
    }
  })

  it("preserves page numbers across chunks", () => {
    const chunks = chunkParagraphs([
      { pageNumber: 1, text: "Page1 paragraph.\n\n" },
      { pageNumber: 2, text: "Page2 paragraph.\n\n" },
    ])
    const p1 = chunks.find((c) => c.text.includes("Page1"))
    const p2 = chunks.find((c) => c.text.includes("Page2"))
    expect(p1?.startPage).toBe(1)
    expect(p2?.startPage).toBe(2)
  })

  it("never produces an empty chunk", () => {
    const chunks = chunkParagraphs([{ pageNumber: 1, text: "" }])
    expect(chunks.every((c) => c.text.length > 0)).toBe(true)
    // Empty input yields zero chunks (not an empty chunk)
    expect(chunks.length).toBe(0)
  })

  it("handles single very long unpunctuated line by hard-splitting at 1500 chars", () => {
    const longLine = "x".repeat(3500)
    const chunks = chunkParagraphs([{ pageNumber: 1, text: longLine }])
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks.every((c) => c.text.length <= 1500)).toBe(true)
  })

  it("assigns sequential indices starting at 0", () => {
    const text = "Sentence. ".repeat(200) // forces multiple chunks
    const chunks = chunkParagraphs([{ pageNumber: 1, text }])
    expect(chunks[0].index).toBe(0)
    expect(chunks[chunks.length - 1].index).toBe(chunks.length - 1)
  })

  it("returns [] for an empty pages array", () => {
    expect(chunkParagraphs([])).toEqual([])
  })

  it("splits oversized Chinese paragraph at Chinese sentence boundary", () => {
    const sent = "这是一句话。".repeat(300) // ~1800 chars, all Chinese
    const chunks = chunkParagraphs([{ pageNumber: 1, text: sent }])
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1500)
      // Each chunk must end on a Chinese OR English sentence boundary
      expect(c.text.trim()).toMatch(/[.!?。！？]$/)
    }
  })
})
