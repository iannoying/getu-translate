import type { PrimitiveAtom } from "jotai"
// @vitest-environment jsdom
import type { ReactNode } from "react"
import type { Entitlements } from "@/types/entitlements"
import { act, renderHook } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { useProExpiryEffect } from "../use-pro-expiry-effect"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface Provider { id: string, provider: string, enabled: boolean, name: string }

// vi.hoisted runs before any imports resolve, so we must use require() to
// access Jotai synchronously. We cast the result to the expected atom type.
const providersConfigAtom = vi.hoisted(() => {
  // eslint-disable-next-line ts/no-require-imports
  const jotai = require("jotai") as typeof import("jotai")
  return jotai.atom<Provider[]>([
    { id: "getu-pro-default", provider: "getu-pro", enabled: true, name: "GetU Pro" },
  ]) as PrimitiveAtom<Provider[]>
})

// Mock configFieldsAtomMap so reads/writes go to a simple in-memory atom.
vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    providersConfig: providersConfigAtom,
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
  graceUntil: null,
  billingEnabled: true,
  billingProvider: "paddle",
}

function makeWrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <JotaiProvider store={store}>{children}</JotaiProvider>
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useProExpiryEffect", () => {
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    store = createStore()
    store.set(providersConfigAtom, [
      { id: "getu-pro-default", provider: "getu-pro", enabled: true, name: "GetU Pro" },
    ])
    store.set(entitlementsAtom, FREE_ENTITLEMENTS)
  })

  it("does nothing when tier stays at free", () => {
    renderHook(() => useProExpiryEffect(), { wrapper: makeWrapper(store) })

    expect(store.get(providersConfigAtom)[0].enabled).toBe(true)
  })

  it("does nothing when tier transitions from free to pro", () => {
    renderHook(() => useProExpiryEffect(), { wrapper: makeWrapper(store) })

    act(() => {
      store.set(entitlementsAtom, PRO_ENTITLEMENTS)
    })

    expect(store.get(providersConfigAtom)[0].enabled).toBe(true)
  })

  it("disables getu-pro when tier transitions from pro to free", () => {
    store.set(entitlementsAtom, PRO_ENTITLEMENTS)

    renderHook(() => useProExpiryEffect(), { wrapper: makeWrapper(store) })

    act(() => {
      store.set(entitlementsAtom, FREE_ENTITLEMENTS)
    })

    const providers = store.get(providersConfigAtom)
    const getuPro = providers.find(p => p.provider === "getu-pro")
    expect(getuPro?.enabled).toBe(false)
  })

  it("does not write when getu-pro is already disabled", () => {
    store.set(entitlementsAtom, PRO_ENTITLEMENTS)
    store.set(providersConfigAtom, [
      { id: "getu-pro-default", provider: "getu-pro", enabled: false, name: "GetU Pro" },
    ])

    renderHook(() => useProExpiryEffect(), { wrapper: makeWrapper(store) })

    const beforeValue = store.get(providersConfigAtom)

    act(() => {
      store.set(entitlementsAtom, FREE_ENTITLEMENTS)
    })

    // If the hook skipped the write, the atom value is the same object
    expect(store.get(providersConfigAtom)).toBe(beforeValue)
    expect(store.get(providersConfigAtom)[0].enabled).toBe(false)
  })

  it("leaves non-getu-pro providers unchanged", () => {
    store.set(providersConfigAtom, [
      { id: "getu-pro-default", provider: "getu-pro", enabled: true, name: "GetU Pro" },
      { id: "openai-1", provider: "openai", enabled: true, name: "OpenAI" },
    ])
    store.set(entitlementsAtom, PRO_ENTITLEMENTS)

    renderHook(() => useProExpiryEffect(), { wrapper: makeWrapper(store) })

    act(() => {
      store.set(entitlementsAtom, FREE_ENTITLEMENTS)
    })

    const providers = store.get(providersConfigAtom)
    const openai = providers.find(p => p.provider === "openai")
    expect(openai?.enabled).toBe(true)
  })
})
