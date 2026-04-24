import { describe, expect, it } from "vitest"
import { wordsToMarkdown } from "../words-markdown"

const WORD = {
  id: 1,
  word: "ephemeral",
  context: "An ephemeral moment.",
  sourceUrl: "https://example.com",
  translation: "短暂的",
  interval: 3,
  repetitions: 1,
  nextReviewAt: new Date("2026-05-04T00:00:00Z"),
  createdAt: new Date("2026-05-01T00:00:00Z"),
}

describe("wordsToMarkdown", () => {
  it("includes YAML frontmatter block", () => {
    const md = wordsToMarkdown([WORD as never])
    expect(md).toContain("---")
    expect(md).toContain("word: ephemeral")
    expect(md).toContain("translation: 短暂的")
    expect(md).toContain("interval: 3")
    expect(md).toContain("repetitions: 1")
  })

  it("includes ## heading with the word", () => {
    const md = wordsToMarkdown([WORD as never])
    expect(md).toContain("## ephemeral")
  })

  it("includes context line", () => {
    const md = wordsToMarkdown([WORD as never])
    expect(md).toContain("An ephemeral moment.")
  })

  it("handles multiple words with separator", () => {
    const md = wordsToMarkdown([WORD as never, { ...WORD, id: 2, word: "serendipity" } as never])
    expect(md).toContain("## ephemeral")
    expect(md).toContain("## serendipity")
    expect(md.split("---").length).toBeGreaterThanOrEqual(3)
  })
})
