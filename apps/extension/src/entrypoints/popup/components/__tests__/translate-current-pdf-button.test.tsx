// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import TranslateCurrentPdfButton from "../translate-current-pdf-button"

const tabsQueryMock = vi.fn()
const tabsCreateMock = vi.fn()
const windowCloseSpy = vi.fn()

vi.mock("#imports", () => ({
  browser: {
    tabs: {
      query: (...args: unknown[]) => tabsQueryMock(...args),
      create: (...args: unknown[]) => tabsCreateMock(...args),
    },
  },
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("wxt/browser", () => ({
  browser: {
    tabs: {
      query: (...args: unknown[]) => tabsQueryMock(...args),
      create: (...args: unknown[]) => tabsCreateMock(...args),
    },
  },
}))

vi.mock("@/utils/constants/url", () => ({
  WEB_DOCUMENT_TRANSLATE_URL: "https://example.test/document/",
}))

vi.mock("@/components/ui/base-ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

beforeEach(() => {
  tabsCreateMock.mockResolvedValue(undefined)
  Object.defineProperty(window, "close", {
    configurable: true,
    writable: true,
    value: windowCloseSpy,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("translateCurrentPdfButton", () => {
  it("renders when the active tab URL ends with .pdf", async () => {
    tabsQueryMock.mockResolvedValue([
      { id: 42, url: "https://example.com/paper.pdf" },
    ])

    render(<TranslateCurrentPdfButton />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "popup.translatePdfOnWeb" })).toBeInTheDocument()
    })
  })

  it("does not render when the active tab URL is not a pdf", async () => {
    tabsQueryMock.mockResolvedValue([
      { id: 42, url: "https://example.com/index.html" },
    ])

    const { container } = render(<TranslateCurrentPdfButton />)

    await waitFor(() => {
      expect(tabsQueryMock).toHaveBeenCalled()
    })

    expect(container.querySelector("button")).toBeNull()
  })

  it("opens getutranslate.com/document/?src=<encoded> in a new tab and closes the popup on click", async () => {
    const currentUrl = "https://example.com/paper.pdf"
    tabsQueryMock.mockResolvedValue([{ id: 42, url: currentUrl }])

    render(<TranslateCurrentPdfButton />)

    const button = await screen.findByRole("button", { name: "popup.translatePdfOnWeb" })
    fireEvent.click(button)

    await waitFor(() => {
      expect(tabsCreateMock).toHaveBeenCalledWith({
        url: `https://example.test/document/?src=${encodeURIComponent(currentUrl)}`,
      })
    })
    expect(windowCloseSpy).toHaveBeenCalled()
  })
})
