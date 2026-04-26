// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkbenchLanguagePicker } from "../language-picker"

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

describe("workbench language picker", () => {
  it("disables swap while source is auto", () => {
    render(
      <WorkbenchLanguagePicker
        source="auto"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={vi.fn()}
        portalContainer={document.body}
      />,
    )

    expect(screen.getByLabelText("translationWorkbench.swapLanguages")).toBeDisabled()
  })

  it("enables swap and calls onSwap when source is concrete", () => {
    const onSwap = vi.fn()
    render(
      <WorkbenchLanguagePicker
        source="eng"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={onSwap}
        portalContainer={document.body}
      />,
    )

    const swap = screen.getByLabelText("translationWorkbench.swapLanguages")
    expect(swap).not.toBeDisabled()

    fireEvent.click(swap)

    expect(onSwap).toHaveBeenCalledTimes(1)
  })

  it("shows a raw unsupported target label instead of falling back to English", () => {
    render(
      <WorkbenchLanguagePicker
        source="auto"
        target="ita"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={vi.fn()}
        portalContainer={document.body}
      />,
    )

    expect(screen.getByText("Unsupported language (ita)")).toBeInTheDocument()
    expect(screen.queryByText("languages.eng")).not.toBeInTheDocument()
  })
})
