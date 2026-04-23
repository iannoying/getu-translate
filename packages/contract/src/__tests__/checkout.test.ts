import { describe, expect, it } from "vitest"
import {
  createCheckoutSessionInputSchema,
  createCheckoutSessionOutputSchema,
  createPortalSessionOutputSchema,
} from "../billing"

describe("createCheckoutSession schemas", () => {
  it("accepts valid pro_monthly with getutranslate.com urls", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_monthly",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/upgrade/cancel",
      }),
    ).not.toThrow()
  })

  it("accepts pro_yearly plan", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_yearly",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://www.getutranslate.com/cancel",
      }),
    ).not.toThrow()
  })

  it("rejects http:// urls", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_monthly",
        successUrl: "http://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/cancel",
      }),
    ).toThrow()
  })

  it("rejects arbitrary https urls not on getutranslate.com", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_monthly",
        successUrl: "https://evil.com/steal",
        cancelUrl: "https://getutranslate.com/cancel",
      }),
    ).toThrow()
  })

  it("accepts chrome-extension:// urls", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_monthly",
        successUrl: "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/upgrade-success.html",
        cancelUrl: "https://getutranslate.com/cancel",
      }),
    ).not.toThrow()
  })

  it("createCheckoutSessionOutputSchema accepts url", () => {
    expect(() =>
      createCheckoutSessionOutputSchema.parse({ url: "https://pay.paddle.io/hsc_x" }),
    ).not.toThrow()
  })

  it("createPortalSessionOutputSchema accepts url", () => {
    expect(() =>
      createPortalSessionOutputSchema.parse({ url: "https://billing.paddle.io/portal/xyz" }),
    ).not.toThrow()
  })

  it("accepts provider=paddle", () => {
    const parsed = createCheckoutSessionInputSchema.parse({
      plan: "pro_monthly",
      provider: "paddle",
      successUrl: "https://getutranslate.com/upgrade/success",
      cancelUrl: "https://getutranslate.com/price",
    })
    expect(parsed.provider).toBe("paddle")
  })

  it("accepts provider=stripe", () => {
    const parsed = createCheckoutSessionInputSchema.parse({
      plan: "pro_yearly",
      provider: "stripe",
      successUrl: "https://getutranslate.com/upgrade/success",
      cancelUrl: "https://getutranslate.com/price",
    })
    expect(parsed.provider).toBe("stripe")
  })

  it("defaults provider to paddle when omitted (backward compat)", () => {
    const parsed = createCheckoutSessionInputSchema.parse({
      plan: "pro_monthly",
      successUrl: "https://getutranslate.com/upgrade/success",
      cancelUrl: "https://getutranslate.com/price",
    })
    expect(parsed.provider).toBe("paddle")
  })

  it("rejects unknown provider value", () => {
    expect(() =>
      createCheckoutSessionInputSchema.parse({
        plan: "pro_monthly",
        provider: "square",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
      }),
    ).toThrow()
  })
})
