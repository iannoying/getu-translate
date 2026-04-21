// @vitest-environment jsdom
import type { ReactNode } from "react"
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import {
  FREE_INPUT_TRANSLATION_DAILY_LIMIT,
  useInputTranslationQuota,
} from "../use-input-quota"

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
vi.mock("@/utils/db/dexie/input-translation-usage", () => ({
  getInputTranslationUsage: () => getUsageMock(),
  incrementInputTranslationUsage: () => incrementUsageMock(),
}))

const PRO_UNLIMITED: Entitlements = {
  tier: "pro",
  features: ["input_translate_unlimited"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
}

const EXPIRED_PRO_WITH_FEATURE: Entitlements = {
  tier: "pro",
  features: ["input_translate_unlimited"],
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

describe("useInputTranslationQuota", () => {
  it("reports free cap and current usage after mount", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(3)

    const { result } = renderWithProviders(() => useInputTranslationQuota())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limit).toBe(FREE_INPUT_TRANSLATION_DAILY_LIMIT)
    expect(result.current.used).toBe(3)
    expect(result.current.canTranslate).toBe(true)
  })

  it("reports 'unlimited' for pro users with input_translate_unlimited", async () => {
    useEntitlementsMock.mockReturnValue({ data: PRO_UNLIMITED, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(9999)

    const { result } = renderWithProviders(() => useInputTranslationQuota())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.limit).toBe("unlimited")
    expect(result.current.canTranslate).toBe(true)
  })

  it("free user at cap has canTranslate=false", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(FREE_INPUT_TRANSLATION_DAILY_LIMIT)

    const { result } = renderWithProviders(() => useInputTranslationQuota())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.canTranslate).toBe(false)
  })

  it("isLoading=true while entitlements are loading", () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })
    getUsageMock.mockResolvedValue(0)

    const { result } = renderWithProviders(() => useInputTranslationQuota())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.canTranslate).toBe(false)
  })

  it("checkAndIncrement returns true and advances used when free user is under cap", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(10)
    incrementUsageMock.mockResolvedValue(11)

    const { result } = renderWithProviders(() => useInputTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let ok = false
    await act(async () => {
      ok = await result.current.checkAndIncrement()
    })
    expect(ok).toBe(true)
    expect(result.current.used).toBe(11)
  })

  it("checkAndIncrement returns false when free user would exceed cap", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(FREE_INPUT_TRANSLATION_DAILY_LIMIT)
    incrementUsageMock.mockResolvedValue(FREE_INPUT_TRANSLATION_DAILY_LIMIT + 1)

    const { result } = renderWithProviders(() => useInputTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.checkAndIncrement()
    })
    expect(ok).toBe(false)
    expect(result.current.used).toBe(FREE_INPUT_TRANSLATION_DAILY_LIMIT + 1)
  })

  it("downgrades expired Pro with stale feature flag back to the Free cap", async () => {
    useEntitlementsMock.mockReturnValue({ data: EXPIRED_PRO_WITH_FEATURE, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(FREE_INPUT_TRANSLATION_DAILY_LIMIT)

    const { result } = renderWithProviders(() => useInputTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.limit).toBe(FREE_INPUT_TRANSLATION_DAILY_LIMIT)
    expect(result.current.canTranslate).toBe(false)
  })

  it("checkAndIncrement always returns true for unlimited users", async () => {
    useEntitlementsMock.mockReturnValue({ data: PRO_UNLIMITED, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(500)
    incrementUsageMock.mockResolvedValue(501)

    const { result } = renderWithProviders(() => useInputTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let ok = false
    await act(async () => {
      ok = await result.current.checkAndIncrement()
    })
    expect(ok).toBe(true)
  })

  it("pro user bypasses 50/day quota — 60 consecutive checkAndIncrement calls all return true", async () => {
    useEntitlementsMock.mockReturnValue({ data: PRO_UNLIMITED, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(0)
    // Each call increments by 1; mock returns incrementing values well beyond the free cap.
    let counter = 0
    incrementUsageMock.mockImplementation(() => Promise.resolve(++counter))

    const { result } = renderWithProviders(() => useInputTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    for (let i = 0; i < 60; i++) {
      let ok = false
      await act(async () => {
        ok = await result.current.checkAndIncrement()
      })
      expect(ok).toBe(true)
    }
    expect(incrementUsageMock).toHaveBeenCalledTimes(60)
  })

  it("checkAndIncrement returns false while still loading and does not hit Dexie", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: true, isFromCache: false })
    getUsageMock.mockResolvedValue(0)

    const { result } = renderWithProviders(() => useInputTranslationQuota())

    let ok = true
    await act(async () => {
      ok = await result.current.checkAndIncrement()
    })
    expect(ok).toBe(false)
    expect(incrementUsageMock).not.toHaveBeenCalled()
  })

  it("checkAndIncrement fails closed when Dexie increment throws", async () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    getUsageMock.mockResolvedValue(0)
    incrementUsageMock.mockRejectedValue(new Error("indexeddb broken"))

    const { result } = renderWithProviders(() => useInputTranslationQuota())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.checkAndIncrement()
    })
    expect(ok).toBe(false)
  })
})
