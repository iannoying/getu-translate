// @vitest-environment jsdom
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAuthRefreshOnFocus } from "../use-auth-refresh"

const getSessionMock = vi.hoisted(() => vi.fn())
const loggerWarnMock = vi.hoisted(() => vi.fn())

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    getSession: getSessionMock,
  },
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}))

let visibilitySpy: { mockRestore: () => void } | null = null

function setVisibilityState(state: DocumentVisibilityState) {
  visibilitySpy?.mockRestore()
  visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue(state)
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderUseAuthRefresh(userId: string | null) {
  const queryClient = createQueryClient()
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return {
    ...renderHook(() => useAuthRefreshOnFocus(userId), { wrapper }),
    invalidateSpy,
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("useAuthRefreshOnFocus", () => {
  beforeEach(() => {
    getSessionMock.mockReset()
    loggerWarnMock.mockReset()
    setVisibilityState("visible")
  })

  afterEach(() => {
    visibilitySpy?.mockRestore()
    visibilitySpy = null
  })

  it("refreshes the auth session on window focus and then invalidates entitlements for the user", async () => {
    let resolveSession!: () => void
    getSessionMock.mockReturnValue(new Promise<void>((resolve) => {
      resolveSession = resolve
    }))
    const { invalidateSpy } = renderUseAuthRefresh("user-1")

    window.dispatchEvent(new Event("focus"))

    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).not.toHaveBeenCalled()

    resolveSession()

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entitlements", "user-1"] })
    })
  })

  it("does not refresh while the document is hidden", async () => {
    setVisibilityState("hidden")
    getSessionMock.mockResolvedValue(undefined)
    const { invalidateSpy } = renderUseAuthRefresh("user-1")

    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
    await flushMicrotasks()

    expect(getSessionMock).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("refreshes the auth session on visibilitychange when the document is visible", async () => {
    getSessionMock.mockResolvedValue(undefined)
    const { invalidateSpy } = renderUseAuthRefresh("user-2")

    document.dispatchEvent(new Event("visibilitychange"))

    await waitFor(() => {
      expect(getSessionMock).toHaveBeenCalledTimes(1)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entitlements", "user-2"] })
    })
  })

  it("removes focus and visibility listeners on unmount", async () => {
    getSessionMock.mockResolvedValue(undefined)
    const { invalidateSpy, unmount } = renderUseAuthRefresh("user-1")

    unmount()
    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
    await flushMicrotasks()

    expect(getSessionMock).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("catches session refresh failures", async () => {
    const error = new Error("session unavailable")
    getSessionMock.mockRejectedValue(error)
    const { invalidateSpy } = renderUseAuthRefresh("user-1")

    window.dispatchEvent(new Event("focus"))

    await waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledWith("[auth] refresh on focus failed", error)
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("catches entitlement invalidation failures", async () => {
    const error = new Error("query cache unavailable")
    getSessionMock.mockResolvedValue(undefined)
    const { invalidateSpy } = renderUseAuthRefresh(null)
    invalidateSpy.mockRejectedValue(error)

    window.dispatchEvent(new Event("focus"))

    await waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledWith("[auth] refresh on focus failed", error)
    })
  })
})
