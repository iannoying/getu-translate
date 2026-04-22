import type { Paragraph } from "../../paragraph/types"
import type { ViewportLike } from "../position-sync"
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

/**
 * Identity viewport — CSS px == PDF units. Lets us author bounding boxes
 * directly in CSS pixels for clarity.
 */
const IDENTITY: ViewportLike = { transform: [1, 0, 0, 1, 0, 0] }

describe("overlayLayer", () => {
  it("renders one slot per paragraph with data-segment-key", () => {
    const paragraphs = [
      makeFakeParagraph({ key: "p-0-0" }),
      makeFakeParagraph({ key: "p-0-1" }),
      makeFakeParagraph({ key: "p-0-2" }),
    ]
    const { container } = render(
      <OverlayLayer paragraphs={paragraphs} pageIndex={0} viewport={IDENTITY} />,
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
      <OverlayLayer paragraphs={[paragraph]} pageIndex={0} viewport={IDENTITY} />,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot).not.toBeNull()
    expect(slot.style.position).toBe("absolute")
    expect(slot.style.left).toBe("72px")
    // Identity viewport: CSS box == PDF box. top = y + height = 100 + 40 = 140.
    expect(slot.style.top).toBe("140px")
    expect(slot.style.width).toBe("440px")
  })

  it("annotates the inner wrapper with data-page-index", () => {
    const { container } = render(
      <OverlayLayer paragraphs={[]} pageIndex={7} viewport={IDENTITY} />,
    )
    const inner = container.querySelector(".getu-overlay-inner") as HTMLElement
    expect(inner).not.toBeNull()
    expect(inner.getAttribute("data-page-index")).toBe("7")
  })

  it("projects positions through a 2x zoomed y-flip viewport", () => {
    // scale=2, y-flip about H_css=2000 (so H_pdf=1000).
    // Paragraph at PDF (x=50, y=100, w=200, h=20). CSS-space box:
    //   y_top_css    = 2000 - (100+20)*2 = 1760
    //   y_bottom_css = 2000 - 100*2      = 1800
    //   height       = 40, width = 400, x = 100
    // Slot sits at CSS-box bottom: top = 1760 + 40 = 1800.
    const viewport: ViewportLike = { transform: [2, 0, 0, -2, 0, 2000] }
    const paragraph = makeFakeParagraph({
      key: "p-0-0",
      boundingBox: { x: 50, y: 100, width: 200, height: 20 },
    })
    const { container } = render(
      <OverlayLayer
        paragraphs={[paragraph]}
        pageIndex={0}
        viewport={viewport}
      />,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.style.left).toBe("100px")
    expect(slot.style.top).toBe("1800px")
    expect(slot.style.width).toBe("400px")
  })

  it("renders nothing (but still mounts a wrapper) for an empty paragraph list", () => {
    const { container } = render(
      <OverlayLayer paragraphs={[]} pageIndex={0} viewport={IDENTITY} />,
    )
    expect(container.querySelectorAll(".getu-slot")).toHaveLength(0)
    expect(container.querySelector(".getu-overlay-inner")).not.toBeNull()
  })

  it("falls back to `[...]` placeholder when no renderSlotContent is provided", () => {
    const { container } = render(
      <OverlayLayer
        paragraphs={[makeFakeParagraph(), makeFakeParagraph({ key: "p-0-1" })]}
        pageIndex={0}
        viewport={IDENTITY}
      />,
    )
    const slots = container.querySelectorAll(".getu-slot")
    expect(slots).toHaveLength(2)
    for (const slot of Array.from(slots)) {
      expect(slot.textContent).toBe("[...]")
    }
  })

  it("invokes renderSlotContent for each paragraph and forwards the result to the slot", () => {
    const paragraphs = [
      makeFakeParagraph({ key: "p-0-0", text: "alpha" }),
      makeFakeParagraph({ key: "p-0-1", text: "beta" }),
    ]
    const seen: string[] = []
    const renderSlotContent = (p: Paragraph) => {
      seen.push(p.key)
      return `translated:${p.text}`
    }
    const { container } = render(
      <OverlayLayer
        paragraphs={paragraphs}
        pageIndex={0}
        viewport={IDENTITY}
        renderSlotContent={renderSlotContent}
      />,
    )
    expect(seen).toEqual(["p-0-0", "p-0-1"])
    const slots = Array.from(container.querySelectorAll(".getu-slot"))
    expect(slots[0]!.textContent).toBe("translated:alpha")
    expect(slots[1]!.textContent).toBe("translated:beta")
  })

  it("falls back to placeholder for paragraphs whose renderSlotContent returns nullish", () => {
    const paragraphs = [
      makeFakeParagraph({ key: "p-0-0", text: "alpha" }),
      makeFakeParagraph({ key: "p-0-1", text: "beta" }),
    ]
    const renderSlotContent = (p: Paragraph) =>
      p.key === "p-0-0" ? `hello:${p.text}` : undefined
    const { container } = render(
      <OverlayLayer
        paragraphs={paragraphs}
        pageIndex={0}
        viewport={IDENTITY}
        renderSlotContent={renderSlotContent}
      />,
    )
    const slots = Array.from(container.querySelectorAll(".getu-slot"))
    expect(slots[0]!.textContent).toBe("hello:alpha")
    expect(slots[1]!.textContent).toBe("[...]")
  })
})

describe("computeSlotPosition", () => {
  it("places the slot at the paragraph's bottom-left under the identity viewport", () => {
    const paragraph: Paragraph = {
      key: "p-1-2",
      text: "x",
      fontSize: 12,
      boundingBox: { x: 10, y: 200, width: 300, height: 50 },
      items: [],
    }
    expect(computeSlotPosition(paragraph, IDENTITY)).toEqual({
      left: 10,
      top: 250,
      width: 300,
    })
  })

  it("flips y and scales correctly under a zoomed y-flip viewport", () => {
    // Viewport: scale=1.5, y-flip about H_css=1500 (H_pdf=1000).
    // Paragraph box PDF (x=10, y=200, w=300, h=50) → CSS:
    //   x_css   = 10 * 1.5 = 15
    //   y_top   = 1500 - (200+50)*1.5 = 1125
    //   width   = 450
    //   height  = 75
    //   slot top = 1125 + 75 = 1200
    const viewport: ViewportLike = { transform: [1.5, 0, 0, -1.5, 0, 1500] }
    const paragraph: Paragraph = {
      key: "p-1-2",
      text: "x",
      fontSize: 12,
      boundingBox: { x: 10, y: 200, width: 300, height: 50 },
      items: [],
    }
    expect(computeSlotPosition(paragraph, viewport)).toEqual({
      left: 15,
      top: 1200,
      width: 450,
    })
  })
})
