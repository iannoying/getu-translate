// @vitest-environment jsdom
import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { PdfTranslationPage } from "../index"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/entrypoints/options/components/page-layout", () => ({
  PageLayout: ({ children, title }: { children: ReactNode, title: React.ReactNode }) => (
    <div>
      <h1 data-testid="page-title">{title}</h1>
      {children}
    </div>
  ),
}))

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, className }: { icon: string, className?: string }) => (
    <span data-testid={`icon-${icon}`} className={className} />
  ),
}))

// Default: no browser.extension API available (Firefox-style fallback path).
// Individual tests can stub #imports themselves if they need a specific value.
vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
  browser: {
    extension: {},
    runtime: {
      id: "test-extension-id",
    },
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithProviders(ui: ReactNode) {
  const store = createStore()
  return {
    store,
    ...render(<JotaiProvider store={store}>{ui}</JotaiProvider>),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pdfTranslationPage", () => {
  it("renders the page title", () => {
    renderWithProviders(<PdfTranslationPage />)
    expect(screen.getByTestId("page-title")).toHaveTextContent(
      "options.pdfTranslation.title",
    )
  })

  it("renders the four section headings", () => {
    renderWithProviders(<PdfTranslationPage />)

    // 1) Global enable
    expect(
      screen.getByText("options.pdfTranslation.enabled.label"),
    ).toBeInTheDocument()
    // 2) Activation mode
    expect(
      screen.getByText("options.pdfTranslation.activationMode.label"),
    ).toBeInTheDocument()
    // 3) Blocklist
    expect(
      screen.getByText("options.pdfTranslation.blocklist.label"),
    ).toBeInTheDocument()
    // 4) file:// access
    expect(
      screen.getByText("options.pdfTranslation.fileProtocol.label"),
    ).toBeInTheDocument()
  })
})
