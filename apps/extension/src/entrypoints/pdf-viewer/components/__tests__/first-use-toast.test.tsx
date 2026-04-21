// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FirstUseToast } from "../first-use-toast"

vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

describe("firstUseToast", () => {
  it("renders all three action buttons with the expected copy", () => {
    render(
      <FirstUseToast
        onAccept={vi.fn()}
        onSkipOnce={vi.fn()}
        onNever={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "pdfViewer.firstUseToast.accept" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "pdfViewer.firstUseToast.skipOnce" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "pdfViewer.firstUseToast.neverOnThisDomain" }),
    ).toBeInTheDocument()
  })

  it("invokes onAccept and hides the toast when Translate is clicked", () => {
    const onAccept = vi.fn()
    const onSkipOnce = vi.fn()
    const onNever = vi.fn()

    render(
      <FirstUseToast
        onAccept={onAccept}
        onSkipOnce={onSkipOnce}
        onNever={onNever}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "pdfViewer.firstUseToast.accept" }))

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onSkipOnce).not.toHaveBeenCalled()
    expect(onNever).not.toHaveBeenCalled()
    expect(screen.queryByTestId("pdf-first-use-toast")).not.toBeInTheDocument()
  })

  it("invokes onSkipOnce and hides the toast when Not this time is clicked", () => {
    const onAccept = vi.fn()
    const onSkipOnce = vi.fn()
    const onNever = vi.fn()

    render(
      <FirstUseToast
        onAccept={onAccept}
        onSkipOnce={onSkipOnce}
        onNever={onNever}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "pdfViewer.firstUseToast.skipOnce" }))

    expect(onSkipOnce).toHaveBeenCalledTimes(1)
    expect(onAccept).not.toHaveBeenCalled()
    expect(onNever).not.toHaveBeenCalled()
    expect(screen.queryByTestId("pdf-first-use-toast")).not.toBeInTheDocument()
  })

  it("awaits onNever (blocklist write) before closing the toast", async () => {
    const onNever = vi.fn(() => Promise.resolve())

    render(
      <FirstUseToast
        onAccept={vi.fn()}
        onSkipOnce={vi.fn()}
        onNever={onNever}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "pdfViewer.firstUseToast.neverOnThisDomain" }))

    expect(onNever).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(
        screen.queryByTestId("pdf-first-use-toast"),
      ).not.toBeInTheDocument()
    })
  })

  it("dismisses on Escape key and calls onSkipOnce", () => {
    const onSkipOnce = vi.fn()

    render(
      <FirstUseToast
        onAccept={vi.fn()}
        onSkipOnce={onSkipOnce}
        onNever={async () => {}}
      />,
    )

    fireEvent.keyDown(window, { key: "Escape" })

    expect(onSkipOnce).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByTestId("pdf-first-use-toast"),
    ).not.toBeInTheDocument()
  })
})
