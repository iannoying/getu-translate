import { describe, expect, it } from "vitest"
import { aggregate } from "../aggregate"
import { doubleColumn } from "./fixtures/double-column"
import { headingAndBody } from "./fixtures/heading-and-body"
import { lineContinuationHyphen } from "./fixtures/line-continuation-hyphen"
import { multipleParagraphs } from "./fixtures/multiple-paragraphs"
import { simpleParagraph } from "./fixtures/simple-paragraph"

describe("aggregate", () => {
  describe("simple paragraph", () => {
    it("groups 3 lines of same paragraph into 1 Paragraph", () => {
      const result = aggregate(simpleParagraph.items)
      expect(result).toHaveLength(1)
      expect(result[0]!.text).toMatch(/^The quick brown fox/)
      expect(result[0]!.text).toContain("silently.")
    })

    it("joins all three lines with single spaces (no doubled spaces)", () => {
      const [p] = aggregate(simpleParagraph.items)
      expect(p!.text).not.toMatch(/ {2}/)
      expect(p!.text).toBe(
        "The quick brown fox jumps over the lazy dog while the owl watches silently.",
      )
    })

    it("assigns the requested page-qualified key", () => {
      const result = aggregate(simpleParagraph.items, { pageIndex: 3 })
      expect(result[0]!.key).toBe("p-3-0")
    })

    it("defaults pageIndex to 0 when omitted", () => {
      const result = aggregate(simpleParagraph.items)
      expect(result[0]!.key).toBe("p-0-0")
    })

    it("computes a bounding box spanning every item", () => {
      const [p] = aggregate(simpleParagraph.items)
      expect(p!.boundingBox.x).toBe(72)
      // The bottom baseline (y=672) is the min y; top = 700 + 12 = 712.
      expect(p!.boundingBox.y).toBe(672)
      expect(p!.boundingBox.height).toBeGreaterThan(0)
      expect(p!.boundingBox.width).toBeGreaterThan(100)
    })

    it("preserves the original TextItems in reading order", () => {
      const [p] = aggregate(simpleParagraph.items)
      expect(p!.items).toHaveLength(3)
      expect(p!.items[0]!.str).toBe("The quick brown fox jumps")
      expect(p!.items[1]!.str).toBe("over the lazy dog while")
      expect(p!.items[2]!.str).toBe("the owl watches silently.")
    })
  })

  describe("multiple paragraphs", () => {
    it("detects paragraph break via extra vertical space", () => {
      expect(aggregate(multipleParagraphs.items)).toHaveLength(2)
    })

    it("emits sequential paragraph keys", () => {
      const result = aggregate(multipleParagraphs.items)
      expect(result.map(p => p.key)).toEqual(["p-0-0", "p-0-1"])
    })

    it("separates the two paragraphs' text cleanly", () => {
      const [first, second] = aggregate(multipleParagraphs.items)
      expect(first!.text).toContain("Paragraph one")
      expect(first!.text).not.toContain("Paragraph two")
      expect(second!.text).toContain("Paragraph two")
      expect(second!.text).not.toContain("Paragraph one")
    })
  })

  describe("heading + body", () => {
    it("separates heading from body by font size", () => {
      const result = aggregate(headingAndBody.items)
      expect(result).toHaveLength(2)
      expect(result[0]!.fontSize).toBeGreaterThan(result[1]!.fontSize)
    })

    it("reports heading font size ~18 and body ~11", () => {
      const [heading, body] = aggregate(headingAndBody.items)
      expect(heading!.fontSize).toBeCloseTo(18, 0)
      expect(body!.fontSize).toBeCloseTo(11, 0)
    })

    it("joins the two body lines into a single paragraph", () => {
      const [, body] = aggregate(headingAndBody.items)
      expect(body!.items).toHaveLength(2)
      expect(body!.text).toBe("We collected samples from three representative sites.")
    })
  })

  describe("double column", () => {
    it("produces 6 paragraphs across two columns", () => {
      expect(aggregate(doubleColumn.items)).toHaveLength(6)
    })

    it("preserves left-column paragraphs and right-column paragraphs separately", () => {
      const result = aggregate(doubleColumn.items)
      const lefts = result.filter(p => p.text.startsWith("Left"))
      const rights = result.filter(p => p.text.startsWith("Right"))
      expect(lefts).toHaveLength(3)
      expect(rights).toHaveLength(3)
    })

    it("keeps a left paragraph's two lines fused", () => {
      const result = aggregate(doubleColumn.items)
      const leftOne = result.find(p => p.text.includes("Left para 1"))
      expect(leftOne!.text).toContain("line 1.")
      expect(leftOne!.text).toContain("line 2.")
    })
  })

  describe("line-continuation hyphen", () => {
    it("joins hyphenated line continuation into one word", () => {
      const [p] = aggregate(lineContinuationHyphen.items)
      expect(p!.text).toContain("understanding")
    })

    it("does not leave a trailing hyphen + space in the merged text", () => {
      const [p] = aggregate(lineContinuationHyphen.items)
      expect(p!.text).not.toContain("- ")
      expect(p!.text).not.toMatch(/under-\s/)
    })

    it("produces exactly one paragraph for the hyphenated pair", () => {
      expect(aggregate(lineContinuationHyphen.items)).toHaveLength(1)
    })

    it("glues a short single-letter-syllable prefix without leaving stray \"- \"", () => {
      // Regression guard: earlier HYPHEN_CONTINUATION_RE required `{2,}` letters
      // before the hyphen, which failed on short prefixes like `"re-"` and left
      // a stray `"- "` in the joined text. Keep this case so that bug doesn't
      // reappear.
      const [p] = aggregate([
        {
          str: "Conditions may re-",
          transform: [12, 0, 0, 12, 72, 700],
          width: 120,
          height: 12,
          fontName: "f",
        },
        {
          str: "ally differ in practice.",
          transform: [12, 0, 0, 12, 72, 686],
          width: 130,
          height: 12,
          fontName: "f",
        },
      ])
      expect(p!.text).toContain("really")
      expect(p!.text).not.toContain("- ")
      expect(p!.text).not.toContain("re-")
    })
  })

  describe("edge cases", () => {
    it("returns empty array for empty input", () => {
      expect(aggregate([])).toEqual([])
    })

    it("filters out zero-length text items but still produces a paragraph", () => {
      const result = aggregate([
        {
          str: "",
          transform: [12, 0, 0, 12, 72, 700],
          width: 0,
          height: 12,
          fontName: "f",
        },
        {
          str: "Only content",
          transform: [12, 0, 0, 12, 72, 700],
          width: 60,
          height: 12,
          fontName: "f",
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0]!.text).toBe("Only content")
    })
  })
})
