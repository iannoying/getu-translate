// @vitest-environment jsdom
import type { ReactNode } from "react"
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { useProGuard } from "../use-pro-guard"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useSessionMock = vi.fn()

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
  },
}))

const useEntitlementsMock = vi.fn()

vi.mock("@/hooks/use-entitlements", () => ({
  useEntitlements: (userId: string | null) => useEntitlementsMock(userId),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "vocab_unlimited"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

function renderWithProviders<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const store = createStore()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  )
  return renderHook(hook, { wrapper })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useProGuard", () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useEntitlementsMock.mockReset()
  })

  it("guard returns true when feature is granted, dialog stays closed", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    const { result } = renderWithProviders(() => useProGuard())

    let granted: boolean = false
    act(() => {
      granted = result.current.guard("pdf_translate")
    })

    expect(granted).toBe(true)
    expect(result.current.dialogProps.open).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it("guard returns false when feature is denied and sets dialogProps.open to true", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    const { result } = renderWithProviders(() => useProGuard())

    let granted: boolean = true
    act(() => {
      granted = result.current.guard("pdf_translate")
    })

    expect(granted).toBe(false)
    expect(result.current.dialogProps.open).toBe(true)
  })

  it("dialogProps.source reflects the last failed guard's source", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    const { result } = renderWithProviders(() => useProGuard())

    act(() => {
      result.current.guard("pdf_translate", { source: "pdf-button" })
    })

    expect(result.current.dialogProps.source).toBe("pdf-button")
  })

  it("multiple guards in same tick: last one wins for source", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    const { result } = renderWithProviders(() => useProGuard())

    act(() => {
      result.current.guard("pdf_translate", { source: "first" })
      result.current.guard("vocab_unlimited", { source: "second" })
    })

    expect(result.current.dialogProps.source).toBe("second")
    expect(result.current.dialogProps.open).toBe(true)
  })

  it("during loading guard() returns false and does NOT open the upgrade dialog", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })

    const { result } = renderWithProviders(() => useProGuard())

    let granted: boolean = true
    act(() => {
      granted = result.current.guard("pdf_translate")
    })

    expect(granted).toBe(false)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.dialogProps.open).toBe(false)
  })
})
