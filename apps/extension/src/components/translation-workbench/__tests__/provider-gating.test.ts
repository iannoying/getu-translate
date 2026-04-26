import type { TranslateProviderConfig } from "@/types/config/provider"
import { describe, expect, it } from "vitest"
import {
  buildSidebarClickRequestId,
  buildSidebarTokenRequestId,
  getProviderGate,
  getTextTranslateCharLimit,
  isGetuProProvider,
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

describe("provider-gating", () => {
  it("identifies GetU Pro providers", () => {
    expect(isGetuProProvider(getuProProvider)).toBe(true)
    expect(isGetuProProvider(googleProvider)).toBe(false)
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

  it("builds separate request ids for click and token buckets", () => {
    expect(buildSidebarClickRequestId("abc")).toBe("sidebar-web-text:abc")
    expect(buildSidebarTokenRequestId("abc", "getu-pro-default")).toBe("sidebar-web-text-token:abc:getu-pro-default")
  })
})
