import type { Entitlements } from "@/types/entitlements"
import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { entitlementsAtom } from "../entitlements"

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "vocab_unlimited"],
  quota: { ai_translate_monthly: { used: 10, limit: 50000 } },
  expiresAt: "2099-01-01T00:00:00.000Z",
}

describe("entitlementsAtom", () => {
  it("starts as FREE_ENTITLEMENTS", () => {
    const store = createStore()
    expect(store.get(entitlementsAtom)).toEqual(FREE_ENTITLEMENTS)
  })

  it("can be written and read back", () => {
    const store = createStore()
    store.set(entitlementsAtom, PRO_ENTITLEMENTS)
    expect(store.get(entitlementsAtom)).toEqual(PRO_ENTITLEMENTS)
  })

  it("retains the latest written value across multiple writes", () => {
    const store = createStore()
    store.set(entitlementsAtom, PRO_ENTITLEMENTS)
    store.set(entitlementsAtom, FREE_ENTITLEMENTS)
    expect(store.get(entitlementsAtom)).toEqual(FREE_ENTITLEMENTS)
  })
})
