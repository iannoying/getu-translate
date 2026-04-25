import { beforeEach, describe, expect, it, vi } from "vitest"

const headersListenerRef: { fn?: (details: any) => void } = {}
const navListenerRef: { fn?: (details: any) => void } = {}
const tabsRemovedListenerRef: { fn?: (tabId: number) => void } = {}

const fakeBrowser = {
  webRequest: {
    onHeadersReceived: {
      addListener: (fn: (details: any) => void) => {
        headersListenerRef.fn = fn
      },
    },
  },
  webNavigation: {
    onCommitted: {
      addListener: (fn: (details: any) => void) => {
        navListenerRef.fn = fn
      },
    },
  },
  tabs: {
    onRemoved: {
      addListener: (fn: (tabId: number) => void) => {
        tabsRemovedListenerRef.fn = fn
      },
    },
  },
}

vi.mock("#imports", () => ({ browser: fakeBrowser }))
vi.mock("wxt/browser", () => ({ browser: fakeBrowser }))

vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

beforeEach(async () => {
  vi.resetModules()
  headersListenerRef.fn = undefined
  navListenerRef.fn = undefined
  tabsRemovedListenerRef.fn = undefined

  const { _resetPdfTabsForTest, setUpPdfTabDetect } = await import("../pdf-tab-detect")
  _resetPdfTabsForTest()
  setUpPdfTabDetect()
})

describe("pdf-tab-detect", () => {
  it("flags a tab when its main_frame Content-Type is application/pdf", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    headersListenerRef.fn?.({
      tabId: 42,
      frameId: 0,
      url: "https://arxiv.org/pdf/2507.15551",
      responseHeaders: [{ name: "Content-Type", value: "application/pdf" }],
    })

    expect(isPdfTab(42)).toBe(true)
  })

  it("treats a charset-suffixed Content-Type as PDF", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    headersListenerRef.fn?.({
      tabId: 7,
      frameId: 0,
      url: "https://example.com/whatever",
      responseHeaders: [{ name: "content-type", value: "application/pdf;charset=binary" }],
    })

    expect(isPdfTab(7)).toBe(true)
  })

  it("clears the flag when the tab navigates to a non-PDF response", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    headersListenerRef.fn?.({
      tabId: 1,
      frameId: 0,
      url: "https://example.com/a.pdf",
      responseHeaders: [{ name: "Content-Type", value: "application/pdf" }],
    })
    expect(isPdfTab(1)).toBe(true)

    headersListenerRef.fn?.({
      tabId: 1,
      frameId: 0,
      url: "https://example.com/index.html",
      responseHeaders: [{ name: "Content-Type", value: "text/html" }],
    })
    expect(isPdfTab(1)).toBe(false)
  })

  it("ignores subframe navigations", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    headersListenerRef.fn?.({
      tabId: 5,
      frameId: 1,
      url: "https://example.com/a.pdf",
      responseHeaders: [{ name: "Content-Type", value: "application/pdf" }],
    })

    expect(isPdfTab(5)).toBe(false)
  })

  it("ignores background-context (tabId < 0) requests", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    headersListenerRef.fn?.({
      tabId: -1,
      frameId: 0,
      url: "https://example.com/a.pdf",
      responseHeaders: [{ name: "Content-Type", value: "application/pdf" }],
    })

    expect(isPdfTab(-1)).toBe(false)
  })

  it("flags a tab via webNavigation when URL ends with .pdf", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    navListenerRef.fn?.({
      tabId: 99,
      frameId: 0,
      url: "file:///tmp/local.pdf",
    })

    expect(isPdfTab(99)).toBe(true)
  })

  it("does not flag via webNavigation when URL is not .pdf", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    navListenerRef.fn?.({
      tabId: 100,
      frameId: 0,
      url: "https://example.com/index.html",
    })

    expect(isPdfTab(100)).toBe(false)
  })

  it("clears the flag when the tab is removed", async () => {
    const { isPdfTab } = await import("../pdf-tab-detect")

    headersListenerRef.fn?.({
      tabId: 33,
      frameId: 0,
      url: "https://example.com/a.pdf",
      responseHeaders: [{ name: "Content-Type", value: "application/pdf" }],
    })
    expect(isPdfTab(33)).toBe(true)

    tabsRemovedListenerRef.fn?.(33)
    expect(isPdfTab(33)).toBe(false)
  })
})
