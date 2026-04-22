import type { Paragraph } from "../../paragraph/types"
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { computeSlotPosition, OverlayLayer } from "../layer"

function makeFakeParagraph(overrides: Partial<Paragraph> = {}): Paragraph {
  return {
    key: "p-0-0",
    text: "Sample paragraph.",
    fontSize: 12,
    boundingBox: { x: 72, y: 100, width: 440, height: 40 },
    items: [],
    ...overrides,
  }
}

describe("overlayLayer", () => {
  it("renders one slot per paragraph with data-segment-key", () => {
    const paragraphs = [
      makeFakeParagraph({ key: "p-0-0" }),
      makeFakeParagraph({ key: "p-0-1" }),
      makeFakeParagraph({ key: "p-0-2" }),
    ]
    const { container } = render(
      <OverlayLayer paragraphs={paragraphs} pageIndex={0} />,
    )
    const slots = container.querySelectorAll("[data-segment-key]")
    expect(slots).toHaveLength(3)
    expect(slots[0]!.getAttribute("data-segment-key")).toBe("p-0-0")
    expect(slots[1]!.getAttribute("data-segment-key")).toBe("p-0-1")
    expect(slots[2]!.getAttribute("data-segment-key")).toBe("p-0-2")
  })

  it("positions each slot absolutely below its paragraph bounding box", () => {
    const paragraph = makeFakeParagraph({
      key: "p-0-0",
      boundingBox: { x: 72, y: 100, width: 440, height: 40 },
    })
    const { container } = render(
      <OverlayLayer paragraphs={[paragraph]} pageIndex={0} />,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot).not.toBeNull()
    expect(slot.style.position).toBe("absolute")
    expect(slot.style.left).toBe("72px")
    // top = y + height = 100 + 40 = 140 (PDF units, pageScale default = 1)
    expect(slot.style.top).toBe("140px")
    expect(slot.style.width).toBe("440px")
  })

  it("renders `[...]` placeholder text in each slot", () => {
    const { container } = render(
      <OverlayLayer
        paragraphs={[makeFakeParagraph(), makeFakeParagraph({ key: "p-0-1" })]}
        pageIndex={0}
      />,
    )
    const slots = container.querySelectorAll(".getu-slot")
    expect(slots).toHaveLength(2)
    for (const slot of Array.from(slots)) {
      expect(slot.textContent).toBe("[...]")
    }
  })

  it("annotates the inner wrapper with data-page-index", () => {
    const { container } = render(
      <OverlayLayer paragraphs={[]} pageIndex={7} />,
    )
    const inner = container.querySelector(".getu-overlay-inner") as HTMLElement
    expect(inner).not.toBeNull()
    expect(inner.getAttribute("data-page-index")).toBe("7")
  })

  it("scales position by pageScale for zoomed viewports", () => {
    const paragraph = makeFakeParagraph({
      key: "p-0-0",
      boundingBox: { x: 50, y: 100, width: 200, height: 20 },
    })
    const { container } = render(
      <OverlayLayer paragraphs={[paragraph]} pageIndex={0} pageScale={2} />,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.style.left).toBe("100px") // 50 * 2
    expect(slot.style.top).toBe("240px") // (100 + 20) * 2
    expect(slot.style.width).toBe("400px") // 200 * 2
  })

  it("renders nothing (but still mounts a wrapper) for an empty paragraph list", () => {
    const { container } = render(
      <OverlayLayer paragraphs={[]} pageIndex={0} />,
    )
    expect(container.querySelectorAll(".getu-slot")).toHaveLength(0)
    expect(container.querySelector(".getu-overlay-inner")).not.toBeNull()
  })
})

describe("computeSlotPosition", () => {
  it("places the slot at the paragraph's bottom-left with paragraph width", () => {
    const paragraph: Paragraph = {
      key: "p-1-2",
      text: "x",
      fontSize: 12,
      boundingBox: { x: 10, y: 200, width: 300, height: 50 },
      items: [],
    }
    expect(computeSlotPosition(paragraph, 1)).toEqual({
      left: 10,
      top: 250,
      width: 300,
    })
  })

  it("applies the pageScale multiplier uniformly", () => {
    const paragraph: Paragraph = {
      key: "p-1-2",
      text: "x",
      fontSize: 12,
      boundingBox: { x: 10, y: 200, width: 300, height: 50 },
      items: [],
    }
    expect(computeSlotPosition(paragraph, 1.5)).toEqual({
      left: 15,
      top: 375,
      width: 450,
    })
  })
})
