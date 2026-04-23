import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStripeClient } from "../client"

describe("stripe client", () => {
  beforeEach(() => vi.restoreAllMocks())

  describe("createCheckoutSession", () => {
    it("POSTs to /v1/checkout/sessions with form-encoded body", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "cs_test_01", url: "https://checkout.stripe.com/pay/cs_test_01" }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createStripeClient({ apiKey: "sk_test_01", baseUrl: "https://api.stripe.com" })
      const out = await client.createCheckoutSession({
        priceId: "price_01",
        email: "u@x.com",
        userId: "user_01",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
      })

      expect(out).toEqual({ sessionId: "cs_test_01", checkoutUrl: "https://checkout.stripe.com/pay/cs_test_01" })
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.stripe.com/v1/checkout/sessions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk_test_01",
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }),
      )
      const body = fetchMock.mock.calls[0][1].body as string
      // form-encoded params
      expect(body).toContain("mode=subscription")
      expect(body).toContain("line_items%5B0%5D%5Bprice%5D=price_01")
      expect(body).toContain("line_items%5B0%5D%5Bquantity%5D=1")
      expect(body).toContain("customer_email=u%40x.com")
      expect(body).toContain("client_reference_id=user_01")
      // URLs encoded properly
      expect(body).toContain("success_url=https%3A%2F%2Fgetutranslate.com%2Fupgrade%2Fsuccess")
      expect(body).toContain("cancel_url=https%3A%2F%2Fgetutranslate.com%2Fprice")
    })

    it("throws on non-2xx with status code + Stripe error message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false, status: 400,
        text: async () => '{"error":{"message":"No such price"}}',
      }))
      const client = createStripeClient({ apiKey: "sk_test", baseUrl: "https://api.stripe.com" })
      await expect(client.createCheckoutSession({
        priceId: "price_bad", email: "e", userId: "u",
        successUrl: "https://getutranslate.com/",
        cancelUrl: "https://getutranslate.com/",
      })).rejects.toThrow(/stripe.*400.*no such price/i)
    })

    it("throws on invalid JSON response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError("unexpected token") },
      }))
      const client = createStripeClient({ apiKey: "sk", baseUrl: "https://x" })
      await expect(client.createCheckoutSession({
        priceId: "p", email: "e", userId: "u",
        successUrl: "https://getutranslate.com/",
        cancelUrl: "https://getutranslate.com/",
      })).rejects.toThrow(/invalid json/i)
    })
  })

  describe("createOneTimePaymentSession", () => {
    it("POSTs mode=payment with explicit payment_method_types[0]=card, unit_amount=800, duration_days=30", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "cs_pay_01", url: "https://checkout.stripe.com/pay/cs_pay_01" }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createStripeClient({ apiKey: "sk_test_01", baseUrl: "https://api.stripe.com" })
      const out = await client.createOneTimePaymentSession({
        amountCents: 800,
        currency: "usd",
        productName: "GetU Pro — 1 month",
        email: "u@x.com",
        userId: "user_01",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
        durationDays: 30,
        paymentMethodTypes: ["card"],
      })

      expect(out).toEqual({ sessionId: "cs_pay_01", checkoutUrl: "https://checkout.stripe.com/pay/cs_pay_01" })
      const body = fetchMock.mock.calls[0][1].body as string
      expect(body).toContain("mode=payment")
      expect(body).toContain("payment_method_types%5B0%5D=card")
      expect(body).not.toContain("automatic_payment_methods")
      expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=800")
      expect(body).toContain("metadata%5Bduration_days%5D=30")
    })

    it("serializes multiple payment methods in order", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "cs_pay_02", url: "https://checkout.stripe.com/pay/cs_pay_02" }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createStripeClient({ apiKey: "sk_test_01", baseUrl: "https://api.stripe.com" })
      await client.createOneTimePaymentSession({
        amountCents: 7200,
        currency: "usd",
        productName: "GetU Pro — 1 year",
        email: "u@x.com",
        userId: "user_01",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
        durationDays: 365,
        paymentMethodTypes: ["card", "alipay", "wechat_pay"],
      })

      const body = fetchMock.mock.calls[0][1].body as string
      expect(body).toContain("payment_method_types%5B0%5D=card")
      expect(body).toContain("payment_method_types%5B1%5D=alipay")
      expect(body).toContain("payment_method_types%5B2%5D=wechat_pay")
      expect(body).toContain("metadata%5Bduration_days%5D=365")
    })

    it("throws when paymentMethodTypes is empty", async () => {
      const client = createStripeClient({ apiKey: "sk", baseUrl: "https://x" })
      await expect(client.createOneTimePaymentSession({
        amountCents: 800,
        currency: "usd",
        productName: "x",
        email: "e",
        userId: "u",
        successUrl: "https://getutranslate.com/",
        cancelUrl: "https://getutranslate.com/",
        durationDays: 30,
        paymentMethodTypes: [],
      })).rejects.toThrow(/at least one payment_method_types/i)
    })
  })

  describe("createPortalSession", () => {
    it("POSTs to /v1/billing_portal/sessions with customer + return_url", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "https://billing.stripe.com/session/bps_test_01" }),
      })
      vi.stubGlobal("fetch", fetchMock)
      const client = createStripeClient({ apiKey: "sk_test", baseUrl: "https://api.stripe.com" })
      const out = await client.createPortalSession({
        customerId: "cus_test_01",
        returnUrl: "https://getutranslate.com/account",
      })
      expect(out.url).toBe("https://billing.stripe.com/session/bps_test_01")
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.stripe.com/v1/billing_portal/sessions",
        expect.objectContaining({ method: "POST" }),
      )
      const body = fetchMock.mock.calls[0][1].body as string
      expect(body).toContain("customer=cus_test_01")
      expect(body).toContain("return_url=https%3A%2F%2Fgetutranslate.com%2Faccount")
    })
  })
})
