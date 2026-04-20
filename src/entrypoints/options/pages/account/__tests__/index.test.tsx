// @vitest-environment jsdom
import type { ReactNode } from "react"
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { AccountPage } from "../index"

vi.mock("@/entrypoints/options/components/page-layout", () => ({
  PageLayout: ({ children, title }: { children: ReactNode, title: React.ReactNode }) => (
    <div>
      <h1 data-testid="page-title">{title}</h1>
      {children}
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useSessionMock = vi.fn()

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

const useEntitlementsMock = vi.fn()

vi.mock("@/hooks/use-entitlements", () => ({
  useEntitlements: (userId: string | null) => useEntitlementsMock(userId),
}))

vi.mock("@/utils/db/dexie/entitlements", () => ({
  deleteCachedEntitlements: vi.fn().mockResolvedValue(undefined),
  writeCachedEntitlements: vi.fn().mockResolvedValue(undefined),
  readCachedEntitlements: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "vocab_unlimited"],
  quota: {
    ai_translate: { used: 50, limit: 200 },
    vocab: { used: 10, limit: 100 },
  },
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const EXPIRED_PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: [],
  quota: {},
  expiresAt: "2020-01-01T00:00:00.000Z",
}

function renderWithProviders(ui: ReactNode, store = createStore()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return {
    store,
    ...render(
      <JotaiProvider store={store}>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </JotaiProvider>,
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("accountPage", () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useEntitlementsMock.mockReset()
    vi.stubGlobal("open", vi.fn())
  })

  it("renders signInPrompt and no upgrade button when anonymous", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.account.signInPrompt")).toBeInTheDocument()
    expect(screen.queryByText("billing.upgrade.cta")).not.toBeInTheDocument()
  })

  it("renders skeleton while session.isPending (no anonymous flash)", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(document.querySelector("[data-slot='skeleton']")).toBeInTheDocument()
    expect(screen.queryByText("billing.account.signInPrompt")).not.toBeInTheDocument()
  })

  it("renders skeleton while loading", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(document.querySelector("[data-slot='skeleton']")).toBeInTheDocument()
  })

  it("renders Free badge and upgrade CTA for free user", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.tier.free")).toBeInTheDocument()
    expect(screen.getByText("billing.upgrade.cta")).toBeInTheDocument()
  })

  it("opens pricing URL with source=options-account when free user clicks upgrade", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    fireEvent.click(screen.getByText("billing.upgrade.cta"))

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("source=options-account"),
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("renders Pro badge and expiry date and manage plan button for pro user", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.tier.pro")).toBeInTheDocument()
    expect(screen.getByText("billing.account.managePlan")).toBeInTheDocument()
    // expiry date should be visible
    expect(screen.getByText(/2099/)).toBeInTheDocument()
  })

  it("renders quota progress bars for pro user", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    // Two quota buckets => two progress bars
    const progressBars = document.querySelectorAll("[data-slot='progress']")
    expect(progressBars.length).toBe(2)
  })

  it("renders expired copy and re-up CTA when expiresAt is in the past", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    // Hook returns FREE_ENTITLEMENTS for expired tier (fail-closed), but
    // we pass the raw expired entitlements to test the page's own expired-date logic
    useEntitlementsMock.mockReturnValue({ data: EXPIRED_PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByText("billing.expiry.expired")).toBeInTheDocument()
    // Should also show an upgrade CTA since isPro returns false for expired
    expect(screen.getByText("billing.upgrade.cta")).toBeInTheDocument()
  })

  it("calls authClient.signOut, resets entitlementsAtom, and deletes Dexie cache on sign out", async () => {
    const { authClient } = await import("@/utils/auth/auth-client")
    const { deleteCachedEntitlements } = await import("@/utils/db/dexie/entitlements")
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    const store = createStore()
    renderWithProviders(<AccountPage />, store)

    fireEvent.click(screen.getByText("billing.account.signOut"))

    await waitFor(() => {
      expect(authClient.signOut).toHaveBeenCalled()
      expect(store.get(entitlementsAtom)).toEqual(FREE_ENTITLEMENTS)
      expect(deleteCachedEntitlements).toHaveBeenCalledWith("user-1")
    })
  })

  it("tolerates Dexie cache delete failure during sign-out", async () => {
    const { authClient } = await import("@/utils/auth/auth-client")
    const { deleteCachedEntitlements } = await import("@/utils/db/dexie/entitlements")
    ;(deleteCachedEntitlements as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("IndexedDB unavailable"))
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "test@example.com" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    const store = createStore()
    renderWithProviders(<AccountPage />, store)

    fireEvent.click(screen.getByText("billing.account.signOut"))

    await waitFor(() => {
      expect(authClient.signOut).toHaveBeenCalled()
      expect(store.get(entitlementsAtom)).toEqual(FREE_ENTITLEMENTS)
    })
    // No uncaught rejection — the .catch swallows IndexedDB errors gracefully.
  })

  it("renders with the billing.account.section title", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    renderWithProviders(<AccountPage />)

    expect(screen.getByTestId("page-title")).toHaveTextContent("billing.account.section")
  })
})
