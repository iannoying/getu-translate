import { describe, expect, it } from "vitest"
import { CJK_RANGES, containsCJK } from "../cjk"

describe("containsCJK", () => {
  it("returns false for Latin-only text", () => {
    expect(containsCJK("hello")).toBe(false)
    expect(containsCJK("Hello, world! 123")).toBe(false)
  })

  it("returns true for CJK Unified Ideographs (Chinese)", () => {
    expect(containsCJK("你好")).toBe(true)
    expect(containsCJK("翻译")).toBe(true)
  })

  it("returns true for mixed Latin + CJK text", () => {
    expect(containsCJK("hello 世界")).toBe(true)
  })

  it("returns true for Hiragana (Japanese)", () => {
    expect(containsCJK("こんにちは")).toBe(true)
  })

  it("returns true for Katakana (Japanese)", () => {
    expect(containsCJK("カタカナ")).toBe(true)
  })

  it("returns true for Hangul Syllables (Korean)", () => {
    expect(containsCJK("안녕")).toBe(true)
  })

  it("returns false for the empty string", () => {
    expect(containsCJK("")).toBe(false)
  })

  it("returns false for whitespace + punctuation only", () => {
    expect(containsCJK("   \n\t.,!?;:")).toBe(false)
  })

  it("exposes the raw CJK_RANGES for callers that need them", () => {
    expect(CJK_RANGES.length).toBeGreaterThan(0)
    for (const [start, end] of CJK_RANGES) {
      expect(start).toBeLessThanOrEqual(end)
    }
  })
})
