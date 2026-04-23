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
