// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import TranslateCurrentPdfButton from "../translate-current-pdf-button"

const tabsQueryMock = vi.fn()
const tabsUpdateMock = vi.fn()
const runtimeGetURLMock = vi.fn()
const windowCloseSpy = vi.fn()

vi.mock("#imports", () => ({
  browser: {
    tabs: {
      query: (...args: unknown[]) => tabsQueryMock(...args),
      update: (...args: unknown[]) => tabsUpdateMock(...args),
    },
    runtime: {
      getURL: (...args: unknown[]) => runtimeGetURLMock(...args),
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
      update: (...args: unknown[]) => tabsUpdateMock(...args),
    },
    runtime: {
      getURL: (...args: unknown[]) => runtimeGetURLMock(...args),
    },
  },
}))

vi.mock("@/components/ui/base-ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

beforeEach(() => {
  runtimeGetURLMock.mockImplementation((path: string) => `chrome-extension://testid${path}`)
  tabsUpdateMock.mockResolvedValue(undefined)
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
      expect(screen.getByRole("button", { name: "popup.translateCurrentPdf" })).toBeInTheDocument()
    })
  })

  it("does not render when the active tab URL is not a pdf", async () => {
    tabsQueryMock.mockResolvedValue([
      { id: 42, url: "https://example.com/index.html" },
    ])

    const { container } = render(<TranslateCurrentPdfButton />)

    // Let the effect resolve
    await waitFor(() => {
      expect(tabsQueryMock).toHaveBeenCalled()
    })

    expect(container.querySelector("button")).toBeNull()
  })

  it("does not render when the active tab is already the viewer URL", async () => {
    tabsQueryMock.mockResolvedValue([
      {
        id: 42,
        url: "chrome-extension://testid/pdf-viewer.html?src=https%3A%2F%2Fexample.com%2Fa.pdf",
      },
    ])

    const { container } = render(<TranslateCurrentPdfButton />)

    await waitFor(() => {
      expect(tabsQueryMock).toHaveBeenCalled()
    })

    expect(container.querySelector("button")).toBeNull()
  })

  it("redirects the current tab to the viewer and closes the popup on click", async () => {
    const currentUrl = "https://example.com/paper.pdf"
    tabsQueryMock.mockResolvedValue([{ id: 42, url: currentUrl }])

    render(<TranslateCurrentPdfButton />)

    const button = await screen.findByRole("button", { name: "popup.translateCurrentPdf" })

    fireEvent.click(button)

    await waitFor(() => {
      expect(tabsUpdateMock).toHaveBeenCalledWith(42, {
        url: `chrome-extension://testid/pdf-viewer.html?src=${encodeURIComponent(currentUrl)}`,
      })
    })
    expect(windowCloseSpy).toHaveBeenCalled()
  })
})
