// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCheckout } from "../use-checkout"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createCheckoutSessionMock = vi.fn()

vi.mock("@/utils/orpc/client", () => ({
  orpcClient: {
    billing: {
      createCheckoutSession: (...args: unknown[]) => createCheckoutSessionMock(...args),
    },
  },
}))

// Use vi.hoisted so that the mock functions can be referenced inside vi.mock
// factories (which are hoisted to the top of the file before variable decls).
const { tabsCreateMock, getURLMock } = vi.hoisted(() => ({
  tabsCreateMock: vi.fn(),
  getURLMock: vi.fn(),
}))

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      getURL: (path: string) => getURLMock(path),
    },
    tabs: {
      create: (...args: unknown[]) => tabsCreateMock(...args),
    },
  },
  i18n: { t: (key: string) => key },
}))

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      getURL: (path: string) => getURLMock(path),
    },
    tabs: {
      create: (...args: unknown[]) => tabsCreateMock(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCheckout", () => {
  beforeEach(() => {
    createCheckoutSessionMock.mockReset()
    tabsCreateMock.mockReset()
    getURLMock.mockReset()
    getURLMock.mockImplementation((path: string) => `chrome-extension://fake-id${path}`)
    tabsCreateMock.mockResolvedValue({ id: 1 })
  })

  it("calls createCheckoutSession with plan, provider=stripe, mode=subscription, and URLs", async () => {
    createCheckoutSessionMock.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" })

    const { result } = renderHook(() => useCheckout())

    await act(async () => {
      await result.current.startCheckout({ plan: "pro_yearly" })
    })

    expect(createCheckoutSessionMock).toHaveBeenCalledWith({
      plan: "pro_yearly",
      provider: "stripe",
      mode: "subscription",
      successUrl: "chrome-extension://fake-id/upgrade-success.html",
      cancelUrl: "chrome-extension://fake-id/upgrade-success.html?cancelled=1",
    })
  })

  it("passes mode=one_time when specified", async () => {
    createCheckoutSessionMock.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" })

    const { result } = renderHook(() => useCheckout())

    await act(async () => {
      await result.current.startCheckout({ plan: "pro_monthly", mode: "one_time" })
    })

    expect(createCheckoutSessionMock).toHaveBeenCalledWith({
      plan: "pro_monthly",
      provider: "stripe",
      mode: "one_time",
      successUrl: "chrome-extension://fake-id/upgrade-success.html",
      cancelUrl: "chrome-extension://fake-id/upgrade-success.html?cancelled=1",
    })
  })

  it("opens a new tab with the checkout URL", async () => {
    const checkoutUrl = "https://checkout.stripe.com/session/abc"
    createCheckoutSessionMock.mockResolvedValue({ url: checkoutUrl })

    const { result } = renderHook(() => useCheckout())

    await act(async () => {
      await result.current.startCheckout({ plan: "pro_monthly" })
    })

    expect(tabsCreateMock).toHaveBeenCalledWith({ url: checkoutUrl })
  })

  it("sets isLoading=true during checkout then false after", async () => {
    let resolve!: (v: { url: string }) => void
    createCheckoutSessionMock.mockReturnValue(new Promise<{ url: string }>((r) => {
      resolve = r
    }))
    tabsCreateMock.mockResolvedValue({ id: 1 })

    const { result } = renderHook(() => useCheckout())

    expect(result.current.isLoading).toBe(false)

    let startPromise: Promise<void>
    act(() => {
      startPromise = result.current.startCheckout({ plan: "pro_yearly" })
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))

    await act(async () => {
      resolve({ url: "https://checkout.stripe.com/session/abc" })
      await startPromise
    })

    expect(result.current.isLoading).toBe(false)
  })

  it("sets error and rethrows when createCheckoutSession fails", async () => {
    const err = new Error("network error")
    createCheckoutSessionMock.mockRejectedValue(err)

    const { result } = renderHook(() => useCheckout())

    let caught: unknown
    await act(async () => {
      try {
        await result.current.startCheckout({ plan: "pro_yearly" })
      }
      catch (e) {
        caught = e
      }
    })

    expect(caught).toBe(err)
    expect(result.current.error).toBe(err)
    expect(result.current.isLoading).toBe(false)
  })

  it("resets error on a subsequent successful call", async () => {
    createCheckoutSessionMock.mockRejectedValueOnce(new Error("first error"))
    createCheckoutSessionMock.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" })

    const { result } = renderHook(() => useCheckout())

    // First call: fail and capture error
    await act(async () => {
      try {
        await result.current.startCheckout({ plan: "pro_yearly" })
      }
      catch {
        // expected
      }
    })

    expect(result.current.error).not.toBeNull()

    // Second call: success — error should be cleared
    await act(async () => {
      await result.current.startCheckout({ plan: "pro_yearly" })
    })

    expect(result.current.error).toBeNull()
  })
})
