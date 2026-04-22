import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPaddleClient } from "../client"

describe("paddle client", () => {
  beforeEach(() => vi.restoreAllMocks())

  describe("createTransaction", () => {
    it("POSTs to /transactions with expected body and auth header", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "txn_01", checkout: { url: "https://pay.paddle.io/hsc_01" } } }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createPaddleClient({ apiKey: "pdl_k_01", baseUrl: "https://sandbox-api.paddle.com" })
      const out = await client.createTransaction({
        priceId: "pri_01",
        email: "u@x.com",
        userId: "user_01",
        successUrl: "https://getutranslate.com/upgrade/success",
      })

      expect(out).toEqual({ transactionId: "txn_01", checkoutUrl: "https://pay.paddle.io/hsc_01" })
      expect(fetchMock).toHaveBeenCalledWith(
        "https://sandbox-api.paddle.com/transactions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer pdl_k_01" }),
        }),
      )
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.custom_data).toEqual({ user_id: "user_01" })
      expect(body.items[0].price_id).toBe("pri_01")
      expect(body.customer.email).toBe("u@x.com")
      expect(body.checkout.url).toBe("https://getutranslate.com/upgrade/success")
      expect(body.collection_mode).toBe("automatic")
    })

    it("throws on non-2xx response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false, status: 400, text: async () => '{"error":{"detail":"bad"}}',
      }))
      const client = createPaddleClient({ apiKey: "k", baseUrl: "https://x" })
      await expect(client.createTransaction({
        priceId: "p", email: "e", userId: "u", successUrl: "https://getutranslate.com/",
      })).rejects.toThrow(/paddle.*400.*bad/i)
    })

    it("throws on invalid JSON response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError("unexpected token") },
      }))
      const client = createPaddleClient({ apiKey: "k", baseUrl: "https://x" })
      await expect(client.createTransaction({
        priceId: "p", email: "e", userId: "u", successUrl: "https://getutranslate.com/",
      })).rejects.toThrow(/invalid json/i)
    })
  })

  describe("createPortalSession", () => {
    it("POSTs to /customers/{id}/portal-sessions", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { urls: { general: { overview: "https://customer-portal.paddle.com/ptl_01" } } },
        }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createPaddleClient({ apiKey: "k", baseUrl: "https://sandbox-api.paddle.com" })
      const out = await client.createPortalSession({ customerId: "ctm_01", subscriptionIds: ["sub_01"] })

      expect(out.url).toBe("https://customer-portal.paddle.com/ptl_01")
      expect(fetchMock).toHaveBeenCalledWith(
        "https://sandbox-api.paddle.com/customers/ctm_01/portal-sessions",
        expect.objectContaining({ method: "POST" }),
      )
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.subscription_ids).toEqual(["sub_01"])
    })

    it("omits subscription_ids when not provided", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { urls: { general: { overview: "https://x/" } } } }),
      })
      vi.stubGlobal("fetch", fetchMock)
      const client = createPaddleClient({ apiKey: "k", baseUrl: "https://x" })
      await client.createPortalSession({ customerId: "ctm_01" })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body).not.toHaveProperty("subscription_ids")
    })
  })
})
