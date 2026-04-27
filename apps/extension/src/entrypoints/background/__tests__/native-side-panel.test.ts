import { beforeEach, describe, expect, it, vi } from "vitest"

const onMessageHandlers = vi.hoisted(() => new Map<string, (message: { data: unknown, sender: chrome.runtime.MessageSender }) => unknown>())

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn((type: string, handler: (message: { data: unknown, sender: chrome.runtime.MessageSender }) => unknown) => {
    onMessageHandlers.set(type, handler)
    return vi.fn()
  }),
}))

describe("native side panel background handlers", () => {
  beforeEach(() => {
    vi.resetModules()
    onMessageHandlers.clear()
    Reflect.deleteProperty(globalThis, "chrome")
  })

  it("reports unsupported when chrome.sidePanel is unavailable", async () => {
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("getNativeSidePanelSupport")

    expect(await handler?.({ data: undefined, sender: {} })).toEqual({ supported: false })
  })

  it("opens a global side panel for the sender window", async () => {
    const open = vi.fn(async () => undefined)
    Object.assign(globalThis, {
      chrome: {
        sidePanel: { open },
      },
    })
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("openNativeSidePanel")

    expect(await handler?.({
      data: undefined,
      sender: { tab: { id: 17, windowId: 91 } } as chrome.runtime.MessageSender,
    })).toEqual({ opened: true })
    expect(open).toHaveBeenCalledWith({ windowId: 91 })
  })

  it("uses an explicit window id when provided", async () => {
    const open = vi.fn(async () => undefined)
    Object.assign(globalThis, {
      chrome: {
        sidePanel: { open },
      },
    })
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("openNativeSidePanel")

    expect(await handler?.({
      data: { windowId: 34 },
      sender: { tab: { id: 17, windowId: 91 } } as chrome.runtime.MessageSender,
    })).toEqual({ opened: true })
    expect(open).toHaveBeenCalledWith({ windowId: 34 })
  })

  it("closes the current window panel when close is supported", async () => {
    const close = vi.fn(async () => undefined)
    Object.assign(globalThis, {
      chrome: {
        sidePanel: { close },
        windows: { getCurrent: vi.fn(async () => ({ id: 55 })) },
      },
    })
    const { setupNativeSidePanelHandlers } = await import("../native-side-panel")

    setupNativeSidePanelHandlers()
    const handler = onMessageHandlers.get("closeNativeSidePanel")

    expect(await handler?.({ data: undefined, sender: {} })).toEqual({ closed: true })
    expect(close).toHaveBeenCalledWith({ windowId: 55 })
  })
})
