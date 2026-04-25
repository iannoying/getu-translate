// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import TranslateCurrentPdfButton from "../translate-current-pdf-button"

const tabsCreateMock = vi.fn()
const windowCloseSpy = vi.fn()
const useIsCurrentTabPdfMock = vi.fn()

vi.mock("#imports", () => ({
  browser: {
    tabs: {
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
      create: (...args: unknown[]) => tabsCreateMock(...args),
    },
  },
}))

vi.mock("@/hooks/use-is-current-tab-pdf", () => ({
  useIsCurrentTabPdf: () => useIsCurrentTabPdfMock(),
}))

vi.mock("@/utils/pdf-detection", () => ({
  buildWebTranslateUrl: (src: string) => `https://example.test/document/?src=${encodeURIComponent(src)}`,
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
  it("renders nothing while detection is loading", () => {
    useIsCurrentTabPdfMock.mockReturnValue({ loading: true, url: "", isPdf: false })

    const { container } = render(<TranslateCurrentPdfButton />)

    expect(container.querySelector("button")).toBeNull()
  })

  it("renders nothing when the active tab is not a PDF", () => {
    useIsCurrentTabPdfMock.mockReturnValue({
      loading: false,
      url: "https://example.com/index.html",
      isPdf: false,
    })

    const { container } = render(<TranslateCurrentPdfButton />)

    expect(container.querySelector("button")).toBeNull()
  })

  it("renders the button when the active tab is a PDF", async () => {
    useIsCurrentTabPdfMock.mockReturnValue({
      loading: false,
      url: "https://arxiv.org/pdf/2507.15551",
      isPdf: true,
    })

    render(<TranslateCurrentPdfButton />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "popup.translatePdfOnWeb" })).toBeInTheDocument()
    })
  })

  it("opens getutranslate.com/document/?src=<encoded> in a new tab and closes the popup on click", async () => {
    const currentUrl = "https://arxiv.org/pdf/2507.15551"
    useIsCurrentTabPdfMock.mockReturnValue({ loading: false, url: currentUrl, isPdf: true })

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
