// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarDocumentTab } from "../sidebar-document-tab"

const createTabMock = vi.hoisted(() => vi.fn())

vi.mock("#imports", () => ({
  browser: { tabs: { create: createTabMock } },
}))

vi.mock("wxt/browser", () => ({
  browser: { tabs: { create: createTabMock } },
}))

vi.mock("@/utils/constants/url", () => ({
  WEB_DOCUMENT_TRANSLATE_URL: "https://getutranslate.com/document/",
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

describe("sidebarDocumentTab", () => {
  beforeEach(() => {
    createTabMock.mockClear()
  })

  it("renders supported document formats and opens the website upload page", () => {
    render(<SidebarDocumentTab />)

    expect(screen.getByRole("heading", { name: "translationWorkbench.documentTitle" })).toBeInTheDocument()
    for (const label of ["PDF", "EPUB", "DOCX", "TXT", "HTML", "MD", "SRT", "ASS", "VTT", "LRC"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.uploadDocument" }))

    expect(createTabMock).toHaveBeenCalledWith({ url: "https://getutranslate.com/document/" })
  })
})
