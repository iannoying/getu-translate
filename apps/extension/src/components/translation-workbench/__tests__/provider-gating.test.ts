import type { TranslateProviderConfig } from "@/types/config/provider"
import type { Entitlements } from "@/types/entitlements"
import { describe, expect, it } from "vitest"
import {
  buildSidebarClickRequestId,
  buildSidebarTokenRequestId,
  getProviderGate,
  getTextTranslateCharLimit,
  isFreeTranslateProvider,
  isGetuProProvider,
  planFromEntitlements,
} from "../provider-gating"

const googleProvider = {
  id: "google-translate-default",
  name: "Google Translate",
  enabled: true,
  provider: "google-translate",
} as TranslateProviderConfig

const getuProProvider = {
  id: "getu-pro-default",
  name: "DeepSeek-V4-Pro",
  enabled: true,
  provider: "getu-pro",
  model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
} as TranslateProviderConfig

function entitlements(overrides: Partial<Entitlements>): Entitlements {
  return {
    tier: "free",
    features: [],
    quota: {},
    expiresAt: null,
    graceUntil: null,
    billingEnabled: false,
    billingProvider: null,
    ...overrides,
  }
}

describe("provider-gating", () => {
  it("identifies GetU Pro providers", () => {
    expect(isGetuProProvider(getuProProvider)).toBe(true)
    expect(isGetuProProvider(googleProvider)).toBe(false)
  })

  it("identifies free built-in translate providers", () => {
    expect(isFreeTranslateProvider(googleProvider)).toBe(true)
    expect(isFreeTranslateProvider(getuProProvider)).toBe(false)
  })

  it("requires login before anonymous users can invoke any provider", () => {
    expect(getProviderGate(googleProvider, "anonymous")).toBe("login-required")
    expect(getProviderGate(getuProProvider, "anonymous")).toBe("login-required")
  })

  it("allows free providers for signed-in plans", () => {
    expect(getProviderGate(googleProvider, "free")).toBe("available")
    expect(getProviderGate(googleProvider, "pro")).toBe("available")
    expect(getProviderGate(googleProvider, "enterprise")).toBe("available")
  })

  it("gates GetU Pro providers by auth and entitlement", () => {
    expect(getProviderGate(getuProProvider, "anonymous")).toBe("login-required")
    expect(getProviderGate(getuProProvider, "free")).toBe("upgrade-required")
    expect(getProviderGate(getuProProvider, "pro")).toBe("available")
    expect(getProviderGate(getuProProvider, "enterprise")).toBe("available")
  })

  it("uses website text limits", () => {
    expect(getTextTranslateCharLimit("anonymous")).toBe(2000)
    expect(getTextTranslateCharLimit("free")).toBe(2000)
    expect(getTextTranslateCharLimit("pro")).toBe(20000)
    expect(getTextTranslateCharLimit("enterprise")).toBe(20000)
  })

  it("derives anonymous and free plans from entitlements", () => {
    expect(planFromEntitlements(null, entitlements({ tier: "pro", expiresAt: "2999-01-01T00:00:00.000Z" }))).toBe("anonymous")
    expect(planFromEntitlements("u1", entitlements({ tier: "free" }))).toBe("free")
  })

  it("derives pro plans only from active pro entitlements", () => {
    expect(planFromEntitlements("u1", entitlements({ tier: "pro", expiresAt: "2999-01-01T00:00:00.000Z" }))).toBe("pro")
    expect(planFromEntitlements("u1", entitlements({ tier: "pro", expiresAt: "2000-01-01T00:00:00.000Z" }))).toBe("free")
    expect(planFromEntitlements("u1", entitlements({ tier: "pro", expiresAt: null }))).toBe("free")
  })

  it("derives enterprise plans only from active enterprise entitlements", () => {
    expect(planFromEntitlements("u1", entitlements({ tier: "enterprise", expiresAt: null }))).toBe("enterprise")
    expect(planFromEntitlements("u1", entitlements({ tier: "enterprise", expiresAt: "2999-01-01T00:00:00.000Z" }))).toBe("enterprise")
    expect(planFromEntitlements("u1", entitlements({ tier: "enterprise", expiresAt: "2000-01-01T00:00:00.000Z" }))).toBe("free")
  })

  it("keeps click quota request ids compatible with UUID-based API validators", () => {
    const clickId = "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80"
    expect(buildSidebarClickRequestId(clickId)).toBe(clickId)
  })

  it("builds separate request ids for token buckets", () => {
    expect(buildSidebarTokenRequestId("abc", "getu-pro-default")).toBe("sidebar-web-text-token:abc:getu-pro-default")
  })
})
