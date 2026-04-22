// @vitest-environment jsdom
import type { ReactNode } from "react"
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import {
  FREE_PDF_PAGES_PER_DAY,
  usePdfTranslationQuota,
} from "../use-pdf-quota"

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

const getUsageMock = vi.fn()
const incrementUsageMock = vi.fn()
vi.mock("@/utils/db/dexie/pdf-translation-usage", () => ({
  getPdfPageUsage: () => getUsageMock(),
  incrementPdfPageUsage: () => incrementUsageMock(),
}))

const PRO_UNLIMITED: Entitlements = {
  tier: "pro",
  features: ["pdf_translate_unlimited"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const EXPIRED_PRO_WITH_FEATURE: Entitlements = {
  tier: "pro",
  features: ["pdf_translate_unlimited"],
  quota: {},
  // expiresAt is in the past so isPro() returns false; defends against a
  // stale backend payload that leaves the feature flag on after expiry.
  expiresAt: "2020-01-01T00:00:00.000Z",
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

beforeEach(() => {
  useSessionMock.mockReset()
  useEntitlementsMock.mockReset()
  getUsageMock.mockReset()
  incrementUsageMock.mockReset()
  useSessionMock.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false })
})

describe("usePdfTranslationQuota", () => {
  it("free user with used=0 can translate a page", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(0)

    const { result } = renderWithProviders(() => usePdfTranslationQuota())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limit).toBe(FREE_PDF_PAGES_PER_DAY)
    expect(result.current.used).toBe(0)
    expect(result.current.canTranslatePage).toBe(true)
  })

  it("free user with used=49 can still translate one more page", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(FREE_PDF_PAGES_PER_DAY - 1)

    const { result } = renderWithProviders(() => usePdfTranslationQuota())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.used).toBe(FREE_PDF_PAGES_PER_DAY - 1)
    expect(result.current.canTranslatePage).toBe(true)
  })

  it("free user at cap (used=50) cannot translate another page", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(FREE_PDF_PAGES_PER_DAY)

    const { result } = renderWithProviders(() => usePdfTranslationQuota())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.used).toBe(FREE_PDF_PAGES_PER_DAY)
    expect(result.current.canTranslatePage).toBe(false)
  })

  it("pro user with pdf_translate_unlimited reports limit='unlimited' and can always translate", async () => {
    useEntitlementsMock.mockReturnValue({ data: PRO_UNLIMITED, isLoading: false, isFromCache: false })
    // Even with a huge counter, unlimited users bypass the cap.
    getUsageMock.mockResolvedValue(9999)

    const { result } = renderWithProviders(() => usePdfTranslationQuota())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limit).toBe("unlimited")
    expect(result.current.canTranslatePage).toBe(true)
  })

  it("recordPageSuccess increments the counter and returns the new count", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(10)
    incrementUsageMock.mockResolvedValue(11)

    const { result } = renderWithProviders(() => usePdfTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let next = 0
    await act(async () => {
      next = await result.current.recordPageSuccess()
    })
    expect(next).toBe(11)
    expect(result.current.used).toBe(11)
    expect(incrementUsageMock).toHaveBeenCalledTimes(1)
  })

  it("downgrades expired Pro with stale feature flag back to the Free cap", async () => {
    useEntitlementsMock.mockReturnValue({ data: EXPIRED_PRO_WITH_FEATURE, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(FREE_PDF_PAGES_PER_DAY)

    const { result } = renderWithProviders(() => usePdfTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.limit).toBe(FREE_PDF_PAGES_PER_DAY)
    expect(result.current.canTranslatePage).toBe(false)
  })

  it("isLoading=true gates canTranslatePage to false while entitlements resolve", () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })
    getUsageMock.mockResolvedValue(0)

    const { result } = renderWithProviders(() => usePdfTranslationQuota())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.canTranslatePage).toBe(false)
  })
})
