// @vitest-environment jsdom
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAuthRefreshOnFocus } from "../use-auth-refresh"

const loggerWarnMock = vi.hoisted(() => vi.fn())

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

function renderUseAuthRefresh(userId: string | null, refetchSession = vi.fn()) {
  const queryClient = createQueryClient()
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return {
    ...renderHook(() => useAuthRefreshOnFocus(userId, refetchSession), { wrapper }),
    invalidateSpy,
    refetchSession,
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("useAuthRefreshOnFocus", () => {
  beforeEach(() => {
    loggerWarnMock.mockReset()
    setVisibilityState("visible")
  })

  afterEach(() => {
    visibilitySpy?.mockRestore()
    visibilitySpy = null
  })

  it("refetches the auth session on window focus and then invalidates entitlements for the user", async () => {
    let resolveSession!: () => void
    const refetchSession = vi.fn(() => new Promise<void>((resolve) => {
      resolveSession = resolve
    }))
    const { invalidateSpy } = renderUseAuthRefresh("user-1", refetchSession)

    window.dispatchEvent(new Event("focus"))

    expect(refetchSession).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).not.toHaveBeenCalled()

    resolveSession()

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entitlements", "user-1"] })
    })
  })

  it("also invalidates entitlements for a user id returned by session refetch", async () => {
    const refetchSession = vi.fn(async () => ({
      data: { user: { id: "user-2" } },
    }))
    const { invalidateSpy } = renderUseAuthRefresh("user-1", refetchSession)

    window.dispatchEvent(new Event("focus"))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entitlements", "user-1"] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entitlements", "user-2"] })
    })
  })

  it("does not refresh while the document is hidden", async () => {
    setVisibilityState("hidden")
    const refetchSession = vi.fn(async () => undefined)
    const { invalidateSpy } = renderUseAuthRefresh("user-1", refetchSession)

    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
    await flushMicrotasks()

    expect(refetchSession).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("refreshes the auth session on visibilitychange when the document is visible", async () => {
    const refetchSession = vi.fn(async () => undefined)
    const { invalidateSpy } = renderUseAuthRefresh("user-2", refetchSession)

    document.dispatchEvent(new Event("visibilitychange"))

    await waitFor(() => {
      expect(refetchSession).toHaveBeenCalledTimes(1)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entitlements", "user-2"] })
    })
  })

  it("removes focus and visibility listeners on unmount", async () => {
    const refetchSession = vi.fn(async () => undefined)
    const { invalidateSpy, unmount } = renderUseAuthRefresh("user-1", refetchSession)

    unmount()
    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
    await flushMicrotasks()

    expect(refetchSession).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("catches session refresh failures", async () => {
    const error = new Error("session unavailable")
    const refetchSession = vi.fn(async () => Promise.reject(error))
    const { invalidateSpy } = renderUseAuthRefresh("user-1", refetchSession)

    window.dispatchEvent(new Event("focus"))

    await waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledWith("[auth] refresh on focus failed", error)
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("catches entitlement invalidation failures", async () => {
    const error = new Error("query cache unavailable")
    const refetchSession = vi.fn(async () => undefined)
    const { invalidateSpy } = renderUseAuthRefresh(null, refetchSession)
    invalidateSpy.mockRejectedValue(error)

    window.dispatchEvent(new Event("focus"))

    await waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledWith("[auth] refresh on focus failed", error)
    })
  })
})
