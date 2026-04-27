import { browser, storage } from "#imports"
import { beforeEach, describe, expect, it, vi } from "vitest"

const listeners = vi.hoisted(() => ({
  activated: [] as Array<(info: { tabId: number, windowId: number }) => void>,
  updated: [] as Array<(tabId: number, changeInfo: { status?: string }, tab: { active?: boolean }) => void>,
}))

const storageGetItemMock = vi.hoisted(() => vi.fn(async () => null as boolean | null))
const sendMessageMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

describe("sidebar open background sync", () => {
  beforeEach(() => {
    vi.resetModules()
    listeners.activated = []
    listeners.updated = []
    storageGetItemMock.mockReset().mockResolvedValue(null)
    sendMessageMock.mockReset().mockResolvedValue(undefined)
    browser.tabs.onActivated.addListener = vi.fn((listener: (info: { tabId: number, windowId: number }) => void) => {
      listeners.activated.push(listener)
    })
    browser.tabs.onUpdated.addListener = vi.fn((listener: (tabId: number, changeInfo: { status?: string }, tab: { active?: boolean }) => void) => {
      listeners.updated.push(listener)
    })
    storage.getItem = storageGetItemMock
  })

  it("opens the activated tab when the persisted sidebar state is open", async () => {
    storageGetItemMock.mockResolvedValueOnce(true)
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.activated[0]?.({ tabId: 123, windowId: 7 })

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        "setSidebarOpenOnContentScript",
        { open: true },
        123,
      )
    })
  })

  it("does not message activated tabs when the persisted sidebar state is closed", async () => {
    storageGetItemMock.mockResolvedValueOnce(false)
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.activated[0]?.({ tabId: 123, windowId: 7 })

    await vi.waitFor(() => {
      expect(storageGetItemMock).toHaveBeenCalled()
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("retries sync when an active tab completes loading", async () => {
    storageGetItemMock.mockResolvedValueOnce(true)
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.updated[0]?.(456, { status: "complete" }, { active: true })

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        "setSidebarOpenOnContentScript",
        { open: true },
        456,
      )
    })
  })

  it("does not sync inactive or incomplete tab updates", async () => {
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.updated[0]?.(456, { status: "loading" }, { active: true })
    listeners.updated[0]?.(789, { status: "complete" }, { active: false })

    expect(storageGetItemMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("swallows content-script messaging failures for unsupported pages", async () => {
    storageGetItemMock.mockResolvedValueOnce(true)
    sendMessageMock.mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.activated[0]?.({ tabId: 123, windowId: 7 })

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1)
    })
  })

  it("swallows storage read failures from fire-and-forget sync", async () => {
    storageGetItemMock.mockRejectedValueOnce(new Error("storage unavailable"))
    const { setupSidebarOpenSync } = await import("../sidebar-open-sync")

    setupSidebarOpenSync()
    listeners.activated[0]?.({ tabId: 123, windowId: 7 })

    await vi.waitFor(() => {
      expect(storageGetItemMock).toHaveBeenCalledTimes(1)
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})
