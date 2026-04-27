// @vitest-environment jsdom
import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { isSideOpenAtom } from "../../../atoms"
import { SidebarShell } from "../sidebar-shell"

vi.mock("#imports", () => ({
  browser: { tabs: { create: vi.fn() } },
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

function renderWithStore(ui: ReactNode) {
  const store = createStore()
  store.set(isSideOpenAtom, true)

  return {
    store,
    ...render(<JotaiProvider store={store}>{ui}</JotaiProvider>),
  }
}

describe("sidebarShell", () => {
  it("switches between text and document tabs", () => {
    renderWithStore(<SidebarShell />)

    expect(screen.getByRole("tablist")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "translationWorkbench.textTab" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("heading", { name: "translationWorkbench.textTitle" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: "translationWorkbench.documentTab" }))

    expect(screen.getByRole("tab", { name: "translationWorkbench.documentTab" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("heading", { name: "translationWorkbench.documentTitle" })).toBeInTheDocument()
  })

  it("closes the sidebar", () => {
    const { store } = renderWithStore(<SidebarShell />)

    fireEvent.click(screen.getByLabelText("translationWorkbench.closeSidebar"))

    expect(store.get(isSideOpenAtom)).toBe(false)
  })
})
