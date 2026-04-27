// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { atom, createStore, Provider as JotaiProvider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import SideContent from ".."
import { isSideOpenAtom } from "../../../atoms"

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    sideContent: atom({ width: 420 }),
  },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("../sidebar-text-tab", () => ({
  SidebarTextTab: () => <h2>translationWorkbench.textTitle</h2>,
}))

vi.mock("../sidebar-document-tab", () => ({
  SidebarDocumentTab: () => <h2>translationWorkbench.documentTitle</h2>,
}))

describe("sideContent page reflow", () => {
  it("does not mount sidebar tab contents while closed", () => {
    const store = createStore()
    store.set(isSideOpenAtom, false)

    render(
      <JotaiProvider store={store}>
        <SideContent />
      </JotaiProvider>,
    )

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "translationWorkbench.textTitle" })).not.toBeInTheDocument()
  })

  it("shrinks html width while open and renders the sidebar shell", () => {
    const store = createStore()
    store.set(isSideOpenAtom, true)

    render(
      <JotaiProvider store={store}>
        <SideContent />
      </JotaiProvider>,
    )

    const style = Array.from(document.head.querySelectorAll("style"))
      .find(style => style.textContent?.includes("width: calc(100% - 420px)"))
    expect(style?.textContent).toContain("width: calc(100% - 420px)")
    expect(screen.queryByText("The function is being upgraded")).not.toBeInTheDocument()
    expect(screen.getByRole("tablist")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "translationWorkbench.textTitle" })).toBeInTheDocument()
  })
})
