// @vitest-environment jsdom
import type { ReactNode } from "react"
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { ProGate } from "../pro-gate"

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

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const store = createStore()

  return render(
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </JotaiProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("proGate", () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useEntitlementsMock.mockReset()
  })

  it("renders fallback when userId is null (anonymous)", () => {
    useSessionMock.mockReturnValue({ data: null })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(
      <ProGate feature="pdf_translate" fallback={<div>fallback</div>}>
        <div>children</div>
      </ProGate>,
    )

    expect(screen.getByText("fallback")).toBeInTheDocument()
    expect(screen.queryByText("children")).not.toBeInTheDocument()
    // userId should be null when session data is null
    expect(useEntitlementsMock).toHaveBeenCalledWith(null)
  })

  it("renders fallback while loading (fail-closed)", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } } })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })

    renderWithProviders(
      <ProGate feature="pdf_translate" fallback={<div>fallback</div>}>
        <div>children</div>
      </ProGate>,
    )

    expect(screen.getByText("fallback")).toBeInTheDocument()
    expect(screen.queryByText("children")).not.toBeInTheDocument()
  })

  it("renders fallback when feature not granted", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } } })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(
      <ProGate feature="pdf_translate" fallback={<div>fallback</div>}>
        <div>children</div>
      </ProGate>,
    )

    expect(screen.getByText("fallback")).toBeInTheDocument()
    expect(screen.queryByText("children")).not.toBeInTheDocument()
  })

  it("renders children when feature granted", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } } })
    useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(
      <ProGate feature="pdf_translate" fallback={<div>fallback</div>}>
        <div>children</div>
      </ProGate>,
    )

    expect(screen.getByText("children")).toBeInTheDocument()
    expect(screen.queryByText("fallback")).not.toBeInTheDocument()
  })

  it("renders fallback while loading even when entitlements would be granted (fail-closed)", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } } })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })

    renderWithProviders(
      <ProGate feature="pdf_translate" fallback={<div>fallback</div>}>
        <div>children</div>
      </ProGate>,
    )

    expect(screen.getByText("fallback")).toBeInTheDocument()
    expect(screen.queryByText("children")).not.toBeInTheDocument()
  })
})
