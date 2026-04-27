// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider, useAtomValue } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { isSideOpenAtom } from "../../atoms"
import { SidebarOpenMessageBridge } from "../sidebar-open-message-bridge"

const messageHandlers = vi.hoisted(() => new Map<string, (message: { data: { open: boolean } }) => void>())
const unsubscribeMock = vi.hoisted(() => vi.fn())
const storageState = vi.hoisted(() => ({
  getItem: vi.fn(async () => false),
  setItem: vi.fn(async () => undefined),
  watch: vi.fn((_key: string, _cb: (value: boolean | null) => void) => vi.fn()),
}))

vi.mock("#imports", () => ({
  storage: storageState,
}))

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn((type: string, handler: (message: { data: { open: boolean } }) => void) => {
    messageHandlers.set(type, handler)
    return () => {
      unsubscribeMock()
      if (messageHandlers.get(type) === handler)
        messageHandlers.delete(type)
    }
  }),
}))

function SidebarOpenProbe() {
  const isOpen = useAtomValue(isSideOpenAtom)
  return <div data-testid="sidebar-open">{String(isOpen)}</div>
}

describe("sidebar open message bridge", () => {
  beforeEach(() => {
    messageHandlers.clear()
    unsubscribeMock.mockReset()
    storageState.getItem.mockReset().mockResolvedValue(false)
    storageState.setItem.mockReset().mockResolvedValue(undefined)
    storageState.watch.mockReset().mockImplementation((_key: string, _cb: (value: boolean | null) => void) => vi.fn())
  })

  it("updates the sidebar open atom from background messages", async () => {
    const store = createStore()
    render(
      <JotaiProvider store={store}>
        <SidebarOpenMessageBridge />
        <SidebarOpenProbe />
      </JotaiProvider>,
    )

    const handler = messageHandlers.get("setSidebarOpenOnContentScript")
    expect(handler).toBeDefined()

    handler?.({ data: { open: true } })
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-open")).toHaveTextContent("true")
    })

    handler?.({ data: { open: false } })
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-open")).toHaveTextContent("false")
    })
  })

  it("unregisters the background message listener on unmount", () => {
    const store = createStore()
    const rendered = render(
      <JotaiProvider store={store}>
        <SidebarOpenMessageBridge />
      </JotaiProvider>,
    )

    rendered.unmount()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(messageHandlers.has("setSidebarOpenOnContentScript")).toBe(false)
    expect(store.get(isSideOpenAtom)).toBe(false)
  })
})
