// @vitest-environment jsdom
import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { atom, createStore, Provider as JotaiProvider, useAtomValue } from "jotai"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import FloatingButton from ".."
import { isSideOpenAtom } from "../../../atoms"

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve()),
}))

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      getURL: (path = "") => `chrome-extension://test-extension${path}`,
    },
  },
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    floatingButton: atom({
      enabled: true,
      position: 0.66,
      clickAction: "panel",
      disabledFloatingButtonPatterns: [],
    }),
    sideContent: atom({ width: 360 }),
  },
}))

vi.mock("../../../atoms", () => ({
  enablePageTranslationAtom: atom({ enabled: false }),
  isDraggingButtonAtom: atom(false),
  isSideOpenAtom: atom(false),
}))

vi.mock("../../../index", () => ({
  shadowWrapper: document.body,
}))

vi.mock("../translate-button", () => ({
  default: ({ className }: { className?: string }) => (
    <div data-testid="translate-button" className={className} />
  ),
}))

vi.mock("../components/hidden-button", () => ({
  default: ({ className, onClick }: { className?: string, onClick: () => void }) => (
    <button type="button" data-testid="hidden-button" className={className} onClick={onClick} />
  ),
}))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
})

beforeEach(() => {
  sendMessageMock.mockReset()
  sendMessageMock.mockResolvedValue({ opened: true })
})

interface FloatingButtonConfig {
  enabled: boolean
  position: number
  clickAction: "translate" | "panel"
  disabledFloatingButtonPatterns: string[]
}

const defaultFloatingButton: FloatingButtonConfig = {
  enabled: true,
  position: 0.66,
  clickAction: "panel",
  disabledFloatingButtonPatterns: [],
}

function SideOpenProbe() {
  const isSideOpen = useAtomValue(isSideOpenAtom)

  return <div data-testid="side-open-state">{String(isSideOpen)}</div>
}

function renderWithStore(
  ui: ReactNode,
  {
    floatingButton = defaultFloatingButton,
    isSideOpen = false,
  }: {
    floatingButton?: FloatingButtonConfig
    isSideOpen?: boolean
  } = {},
) {
  const store = createStore()
  void store.set(configFieldsAtomMap.floatingButton, floatingButton)
  void store.set(isSideOpenAtom, isSideOpen)

  return {
    store,
    ...render(<JotaiProvider store={store}>{ui}</JotaiProvider>),
  }
}

describe("floatingButton close trigger", () => {
  it("keeps the main logo button fully visible by default", () => {
    const { container } = renderWithStore(<FloatingButton />)

    const logoButton = container.querySelector("img")?.parentElement

    expect(logoButton).not.toHaveClass("translate-x-6")
    expect(logoButton).not.toHaveClass("group-hover:translate-x-0")
  })

  it("keeps the close trigger in the layout with visibility classes instead of display:none", () => {
    renderWithStore(<FloatingButton />)

    const closeTrigger = screen.getByTitle("Close floating button")

    expect(closeTrigger).toHaveClass("invisible")
    expect(closeTrigger).toHaveClass("group-hover:visible")
    expect(closeTrigger).not.toHaveClass("hidden")
    expect(closeTrigger).not.toHaveClass("group-hover:block")
  })

  it("forces the close trigger visible while the dropdown is open", () => {
    renderWithStore(<FloatingButton />)

    const closeTrigger = screen.getByTitle("Close floating button")
    fireEvent.click(closeTrigger)

    expect(closeTrigger).toHaveClass("visible")
    expect(screen.getByText("options.floatingButtonAndToolbar.floatingButton.closeMenu.disableForSite")).toBeInTheDocument()
  })
})

describe("floatingButton open panel tab", () => {
  it("renders an open-panel tab button with visibility and opacity reveal classes", () => {
    renderWithStore(<FloatingButton />)

    const openPanelTab = screen.getByRole("button", { name: "translationWorkbench.openPanel" })

    expect(openPanelTab).toHaveClass("invisible")
    expect(openPanelTab).toHaveClass("opacity-0")
    expect(openPanelTab).toHaveClass("group-hover:visible")
    expect(openPanelTab).toHaveClass("group-hover:opacity-100")
    expect(openPanelTab).toHaveClass("group-focus-within:visible")
    expect(openPanelTab).toHaveClass("group-focus-within:opacity-100")
    expect(openPanelTab).toHaveClass("focus-visible:visible")
    expect(openPanelTab).toHaveClass("focus-visible:opacity-100")
    expect(openPanelTab).not.toHaveClass("hidden")
    expect(openPanelTab).not.toHaveClass("group-hover:block")
  })

  it("opens the native side panel from the tab without opening the overlay when native succeeds", async () => {
    sendMessageMock.mockResolvedValue({ opened: true })
    const { store } = renderWithStore(
      <>
        <FloatingButton />
        <SideOpenProbe />
      </>,
      { isSideOpen: false },
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.openPanel" }))

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith("openNativeSidePanel", undefined)
    })
    expect(store.get(isSideOpenAtom)).toBe(false)
    expect(screen.getByTestId("side-open-state")).toHaveTextContent("false")
  })

  it("falls back to the overlay when native side panel is unavailable", async () => {
    sendMessageMock.mockResolvedValue({ opened: false })
    const { store } = renderWithStore(
      <>
        <FloatingButton />
        <SideOpenProbe />
      </>,
      { isSideOpen: false },
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.openPanel" }))

    await vi.waitFor(() => {
      expect(store.get(isSideOpenAtom)).toBe(true)
      expect(screen.getByTestId("side-open-state")).toHaveTextContent("true")
    })
    expect(sendMessageMock).toHaveBeenCalledWith("openNativeSidePanel", undefined)
  })

  it("falls back to the overlay when native side panel opening rejects", async () => {
    sendMessageMock.mockRejectedValue(new Error("native side panel unavailable"))
    const { store } = renderWithStore(
      <>
        <FloatingButton />
        <SideOpenProbe />
      </>,
      { isSideOpen: false },
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.openPanel" }))

    await vi.waitFor(() => {
      expect(store.get(isSideOpenAtom)).toBe(true)
      expect(screen.getByTestId("side-open-state")).toHaveTextContent("true")
    })
    expect(sendMessageMock).toHaveBeenCalledWith("openNativeSidePanel", undefined)
  })

  it("opens the panel tab through native side panel without sending the page translation message when the main logo action is translate", async () => {
    sendMessageMock.mockResolvedValue({ opened: false })
    const { store } = renderWithStore(
      <>
        <FloatingButton />
        <SideOpenProbe />
      </>,
      {
        floatingButton: {
          ...defaultFloatingButton,
          clickAction: "translate",
        },
      },
    )

    const openPanelTab = screen.getByRole("button", { name: "translationWorkbench.openPanel" })

    fireEvent.mouseDown(openPanelTab, { clientY: 20 })
    fireEvent.mouseUp(document)
    fireEvent.click(openPanelTab)

    await vi.waitFor(() => {
      expect(store.get(isSideOpenAtom)).toBe(true)
      expect(screen.getByTestId("side-open-state")).toHaveTextContent("true")
    })
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledWith("openNativeSidePanel", undefined)
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      "tryToSetEnablePageTranslationOnContentScript",
      expect.anything(),
    )
  })

  it("keeps the open-panel tab visible and attached while the sidebar is open", () => {
    renderWithStore(<FloatingButton />, { isSideOpen: true })

    const openPanelTab = screen.getByRole("button", { name: "translationWorkbench.openPanel" })

    expect(openPanelTab).toHaveClass("visible")
    expect(openPanelTab).toHaveClass("opacity-100")
    expect(openPanelTab).toHaveClass("translate-x-0")
    expect(screen.getByTestId("translate-button")).toHaveClass("translate-x-0")
    expect(screen.getByTestId("hidden-button")).toHaveClass("translate-x-0")
  })
})
