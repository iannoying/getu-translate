// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkbenchLanguagePicker } from "../language-picker"

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

describe("workbenchLanguagePicker", () => {
  it("selects source and target languages from portaled content", () => {
    const onSourceChange = vi.fn()
    const onTargetChange = vi.fn()

    render(
      <WorkbenchLanguagePicker
        source="auto"
        target="cmn"
        onSourceChange={onSourceChange}
        onTargetChange={onTargetChange}
        onSwap={vi.fn()}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Source language: translationWorkbench.languages.auto" }))
    fireEvent.click(screen.getByRole("button", { name: "languages.eng" }))
    expect(onSourceChange).toHaveBeenCalledWith("eng")

    fireEvent.click(screen.getByRole("button", { name: "Target language: languages.cmn" }))
    fireEvent.click(screen.getByRole("button", { name: "languages.jpn" }))
    expect(onTargetChange).toHaveBeenCalledWith("jpn")
  })

  it("uses distinct source and target trigger names for the same selected language", () => {
    render(
      <WorkbenchLanguagePicker
        source="eng"
        target="eng"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={vi.fn()}
        portalContainer={document.body}
      />,
    )

    expect(screen.getByRole("button", { name: "Source language: languages.eng" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Target language: languages.eng" })).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("disables swap only while source is auto", () => {
    const onSwap = vi.fn()
    const { rerender } = render(
      <WorkbenchLanguagePicker
        source="auto"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={onSwap}
        portalContainer={document.body}
      />,
    )

    expect(screen.getByRole("button", { name: "translationWorkbench.swapLanguages" })).toBeDisabled()

    rerender(
      <WorkbenchLanguagePicker
        source="eng"
        target="cmn"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSwap={onSwap}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.swapLanguages" }))

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
