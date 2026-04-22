// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import * as React from "react"
import { describe, expect, it } from "vitest"
import { segmentStatusAtomFamily } from "../../translation/atoms"
import { SegmentContent } from "../segment-content"

function renderWithStore(
  store: ReturnType<typeof createStore>,
  ui: React.ReactElement,
) {
  return render(<Provider store={store}>{ui}</Provider>)
}

describe("segmentContent", () => {
  it("renders the `[...]` placeholder when status is pending (initial state)", () => {
    const store = createStore()
    const key = "fileA:p-0-0"

    const { container } = renderWithStore(
      store,
      <SegmentContent segmentKey={key} />,
    )
    expect(container.textContent).toBe("[...]")
    expect(container.querySelector(".getu-slot-placeholder")).not.toBeNull()
  })

  it("renders the `[...]` placeholder when status is translating", () => {
    const store = createStore()
    const key = "fileA:p-0-1"
    store.set(segmentStatusAtomFamily(key), { kind: "translating" })

    const { container } = renderWithStore(
      store,
      <SegmentContent segmentKey={key} />,
    )
    expect(container.textContent).toBe("[...]")
    expect(container.querySelector(".getu-slot-placeholder")).not.toBeNull()
  })

  it("renders the translation text when status is done", () => {
    const store = createStore()
    const key = "fileA:p-0-2"
    store.set(segmentStatusAtomFamily(key), {
      kind: "done",
      translation: "这是翻译后的段落",
    })

    const { container } = renderWithStore(
      store,
      <SegmentContent segmentKey={key} />,
    )
    expect(container.textContent).toBe("这是翻译后的段落")
    expect(container.querySelector(".getu-slot-translation")).not.toBeNull()
  })

  it("renders an error glyph with the message in the aria-label when status is error", () => {
    const store = createStore()
    const key = "fileA:p-0-3"
    store.set(segmentStatusAtomFamily(key), {
      kind: "error",
      message: "provider unavailable",
    })

    const { container } = renderWithStore(
      store,
      <SegmentContent segmentKey={key} />,
    )
    const errorEl = container.querySelector(".getu-slot-error") as HTMLElement
    expect(errorEl).not.toBeNull()
    expect(errorEl.textContent).toBe("[×]")
    // vitest.setup.ts mocks `#i18n` with `t: (key) => key`, so both the
    // static tooltip and the interpolated aria-label reduce to their keys.
    // Real locale-string rendering is exercised by the YAML round-trip.
    expect(errorEl.getAttribute("title")).toBe(
      "pdfViewer.segmentContent.errorTooltip",
    )
    expect(errorEl.getAttribute("aria-label")).toBe(
      "pdfViewer.segmentContent.errorAriaLabel",
    )
  })

  it("updates progressively when the atom transitions pending → translating → done", async () => {
    const store = createStore()
    const key = "fileA:p-0-4"

    const { container } = renderWithStore(
      store,
      <SegmentContent segmentKey={key} />,
    )
    expect(container.textContent).toBe("[...]")

    await act(async () => {
      store.set(segmentStatusAtomFamily(key), { kind: "translating" })
    })
    expect(container.textContent).toBe("[...]")

    await act(async () => {
      store.set(segmentStatusAtomFamily(key), {
        kind: "done",
        translation: "done text",
      })
    })
    expect(container.textContent).toBe("done text")
  })
})
