import type { Paragraph } from "../../paragraph/types"
import { describe, expect, it } from "vitest"
import { computePageExtension, DEFAULT_MIN_SLOT_HEIGHT_PX } from "../push-down-layout"

function makeFakeParagraph(overrides: Partial<Paragraph> = {}): Paragraph {
  return {
    key: "p-0-0",
    text: "Sample paragraph.",
    fontSize: 12,
    boundingBox: { x: 0, y: 0, width: 100, height: 10 },
    items: [],
    ...overrides,
  }
}

describe("computePageExtension", () => {
  it("returns 0 for zero paragraphs", () => {
    expect(computePageExtension([], DEFAULT_MIN_SLOT_HEIGHT_PX)).toBe(0)
  })

  it("scales linearly with paragraph count at the default min slot height", () => {
    const three = [
      makeFakeParagraph({ key: "p-0-0" }),
      makeFakeParagraph({ key: "p-0-1" }),
      makeFakeParagraph({ key: "p-0-2" }),
    ]
    // Pin the concrete expected value (3 * 24 = 72) rather than recomputing
    // from DEFAULT_MIN_SLOT_HEIGHT_PX — otherwise both sides would drift
    // together if the default ever changed (e.g. to 0), making the assertion
    // vacuously true. A failure here forces a deliberate re-evaluation.
    expect(computePageExtension(three, DEFAULT_MIN_SLOT_HEIGHT_PX)).toBe(72)
  })

  it("honours a caller-supplied minSlotHeight (does not hard-code the default)", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      makeFakeParagraph({ key: `p-0-${i}` }))
    // 40 is a plausible B2-era measured height; the function must multiply
    // through it rather than silently falling back to DEFAULT_MIN_SLOT_HEIGHT_PX.
    expect(computePageExtension(five, 40)).toBe(200)
  })

  it("returns minSlotHeight for a single paragraph", () => {
    expect(
      computePageExtension([makeFakeParagraph()], DEFAULT_MIN_SLOT_HEIGHT_PX),
    ).toBe(DEFAULT_MIN_SLOT_HEIGHT_PX)
  })

  it("returns 0 when minSlotHeight is 0, regardless of paragraph count", () => {
    const paragraphs = [makeFakeParagraph(), makeFakeParagraph({ key: "p-0-1" })]
    expect(computePageExtension(paragraphs, 0)).toBe(0)
  })
})
