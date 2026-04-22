import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRouterClient } from "@orpc/server"
import { router } from "../index"
import type { Ctx } from "../context"
import { FREE_ENTITLEMENTS } from "@getu/contract"

vi.mock("@getu/db", async (orig) => {
  const actual = await orig<typeof import("@getu/db")>()
  return { ...actual, createDb: vi.fn(() => ({} as any)) }
})
vi.mock("../../billing/entitlements", () => ({
  loadEntitlements: vi.fn(async () => FREE_ENTITLEMENTS),
}))
vi.mock("../../billing/quota", () => ({
  consumeQuota: vi.fn(async () => ({
    bucket: "ai_translate_monthly",
    remaining: 99_900,
    reset_at: "2026-05-01T00:00:00.000Z",
  })),
}))
vi.mock("../../billing/checkout", () => ({
  createCheckoutSession: vi.fn(async () => ({ url: "https://pay.paddle.io/hsc_01" })),
  createPortalSession: vi.fn(async () => ({ url: "https://customer-portal.paddle.com/ptl_01" })),
}))
vi.mock("../../billing/paddle/client", () => ({
  createPaddleClient: vi.fn(() => ({})),
}))

function ctx(session: Ctx["session"]): Ctx {
  return { env: { DB: {} as any, BILLING_ENABLED: "false" } as Ctx["env"], auth: {} as Ctx["auth"], session }
}

beforeEach(() => vi.clearAllMocks())

describe("billing.getEntitlements", () => {
  it("returns free tier for any signed-in user", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1" }, session: { id: "s1" } } as any),
    })
    const e = await client.billing.getEntitlements({})
    expect(e).toEqual(FREE_ENTITLEMENTS)
  })

  it("passes session.user.id to loadEntitlements", async () => {
    const { loadEntitlements } = await import("../../billing/entitlements")
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u42" }, session: { id: "s1" } } as any),
    })
    await client.billing.getEntitlements({})
    expect(loadEntitlements).toHaveBeenCalledWith(expect.anything(), "u42", false)
  })

  it("rejects anonymous", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(client.billing.getEntitlements({})).rejects.toThrow()
  })
})

describe("billing.consumeQuota", () => {
  const validInput = {
    bucket: "ai_translate_monthly" as const,
    amount: 100,
    request_id: "01929b2e-test-7c9e-9f3a-8b4c5d6e7f80",
  }

  it("rejects anonymous", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(client.billing.consumeQuota(validInput)).rejects.toThrow()
  })

  it("rejects invalid bucket", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1" }, session: { id: "s1" } } as any),
    })
    await expect(
      client.billing.consumeQuota({
        bucket: "invalid_bucket" as any,
        amount: 1,
        request_id: "01929b2e-test-7c9e-9f3a-bad-bucket",
      }),
    ).rejects.toThrow()
  })

  it("rejects amount=0 (must be positive)", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1" }, session: { id: "s1" } } as any),
    })
    await expect(
      client.billing.consumeQuota({ ...validInput, amount: 0 }),
    ).rejects.toThrow()
  })

  it("proxies result from consumeQuota impl", async () => {
    const { consumeQuota } = await import("../../billing/quota")
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1" }, session: { id: "s1" } } as any),
    })
    const result = await client.billing.consumeQuota(validInput)
    expect(result).toEqual({
      bucket: "ai_translate_monthly",
      remaining: 99_900,
      reset_at: "2026-05-01T00:00:00.000Z",
    })
    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(), // db
      "u1",
      "ai_translate_monthly",
      100,
      "01929b2e-test-7c9e-9f3a-8b4c5d6e7f80",
    )
  })

  it("passes session.user.id to consumeQuota impl", async () => {
    const { consumeQuota } = await import("../../billing/quota")
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u99" }, session: { id: "s1" } } as any),
    })
    await client.billing.consumeQuota(validInput)
    expect(consumeQuota).toHaveBeenCalledWith(
      expect.anything(),
      "u99",
      expect.any(String),
      expect.any(Number),
      expect.any(String),
    )
  })
})

describe("billing.createCheckoutSession", () => {
  it("router has 4 procedures", async () => {
    const { billingRouter } = await import("../billing")
    expect(Object.keys(billingRouter)).toHaveLength(4)
    expect(Object.keys(billingRouter)).toContain("createCheckoutSession")
    expect(Object.keys(billingRouter)).toContain("createPortalSession")
  })

  it("rejects anonymous", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(
      client.billing.createCheckoutSession({
        plan: "pro_monthly",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
      }),
    ).rejects.toThrow()
  })

  it("returns checkout url for authenticated user", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1", email: "u@x.com" }, session: { id: "s1" } } as any),
    })
    const result = await client.billing.createCheckoutSession({
      plan: "pro_monthly",
      successUrl: "https://getutranslate.com/upgrade/success",
      cancelUrl: "https://getutranslate.com/price",
    })
    expect(result).toEqual({ url: "https://pay.paddle.io/hsc_01" })
  })
})

describe("billing.createPortalSession", () => {
  it("rejects anonymous", async () => {
    const client = createRouterClient(router, { context: ctx(null) })
    await expect(client.billing.createPortalSession({})).rejects.toThrow()
  })

  it("returns portal url for authenticated user", async () => {
    const client = createRouterClient(router, {
      context: ctx({ user: { id: "u1", email: "u@x.com" }, session: { id: "s1" } } as any),
    })
    const result = await client.billing.createPortalSession({})
    expect(result).toEqual({ url: "https://customer-portal.paddle.com/ptl_01" })
  })
})
