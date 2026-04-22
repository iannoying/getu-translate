import type { Paragraph } from "../../paragraph/types"
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Slot } from "../slot"

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

const DEFAULT_POSITION = { left: 10, top: 20, width: 300 }

describe("slot", () => {
  it("renders the `[...]` placeholder when no children are provided", () => {
    const { container } = render(
      <Slot paragraph={makeFakeParagraph()} position={DEFAULT_POSITION} />,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot).not.toBeNull()
    expect(slot.textContent).toBe("[...]")
  })

  it("renders string children instead of the placeholder", () => {
    const { container } = render(
      <Slot paragraph={makeFakeParagraph()} position={DEFAULT_POSITION}>
        翻译后的段落
      </Slot>,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.textContent).toBe("翻译后的段落")
  })

  it("renders React element children instead of the placeholder", () => {
    const { container } = render(
      <Slot paragraph={makeFakeParagraph()} position={DEFAULT_POSITION}>
        <span data-testid="rendered-child">hello</span>
      </Slot>,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.querySelector("[data-testid=rendered-child]")).not.toBeNull()
    expect(slot.textContent).toBe("hello")
  })

  it("falls back to the placeholder when children is null", () => {
    const { container } = render(
      <Slot paragraph={makeFakeParagraph()} position={DEFAULT_POSITION}>
        {null}
      </Slot>,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.textContent).toBe("[...]")
  })

  it("sets data-segment-key from the paragraph", () => {
    const { container } = render(
      <Slot
        paragraph={makeFakeParagraph({ key: "p-2-4" })}
        position={DEFAULT_POSITION}
      />,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.getAttribute("data-segment-key")).toBe("p-2-4")
  })

  it("applies the supplied position + minHeight", () => {
    const { container } = render(
      <Slot
        paragraph={makeFakeParagraph()}
        position={{ left: 50, top: 150, width: 400 }}
        minHeight={48}
      />,
    )
    const slot = container.querySelector(".getu-slot") as HTMLElement
    expect(slot.style.position).toBe("absolute")
    expect(slot.style.left).toBe("50px")
    expect(slot.style.top).toBe("150px")
    expect(slot.style.width).toBe("400px")
    expect(slot.style.minHeight).toBe("48px")
  })
})
