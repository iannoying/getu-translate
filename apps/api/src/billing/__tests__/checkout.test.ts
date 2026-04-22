import { describe, expect, it, vi } from "vitest"
import { ORPCError } from "@orpc/server"
import { createCheckoutSession, createPortalSession } from "../checkout"

function fakeDb(row?: any) {
  return {
    select: () => ({ from: () => ({ where: () => ({ get: async () => row }) }) }),
  } as any
}

function fakePaddle(overrides: any = {}) {
  return {
    createTransaction: vi.fn().mockResolvedValue({
      transactionId: "txn_01", checkoutUrl: "https://pay.paddle.io/hsc_01",
    }),
    createPortalSession: vi.fn().mockResolvedValue({
      url: "https://customer-portal.paddle.com/ptl_01",
    }),
    ...overrides,
  }
}

const baseEnv: any = {
  BILLING_ENABLED: "true",
  PADDLE_API_KEY: "pdl_k",
  PADDLE_BASE_URL: "https://sandbox-api.paddle.com",
  PADDLE_PRICE_PRO_MONTHLY: "pri_m",
  PADDLE_PRICE_PRO_YEARLY: "pri_y",
  PADDLE_WEBHOOK_SECRET: "s",
}

describe("createCheckoutSession", () => {
  it("returns paddle checkout url for fresh user", async () => {
    const paddle = fakePaddle()
    const out = await createCheckoutSession({
      db: fakeDb(null),
      paddle,
      env: baseEnv,
      userId: "u1",
      userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
      },
    })
    expect(out.url).toBe("https://pay.paddle.io/hsc_01")
    expect(paddle.createTransaction).toHaveBeenCalledWith({
      priceId: "pri_m",
      email: "u@x.com",
      userId: "u1",
      successUrl: "https://getutranslate.com/upgrade/success",
    })
  })

  it("uses yearly price id when plan=pro_yearly", async () => {
    const paddle = fakePaddle()
    await createCheckoutSession({
      db: fakeDb(null), paddle, env: baseEnv, userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_yearly",
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })
    expect(paddle.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ priceId: "pri_y" }))
  })

  it("throws PRECONDITION_FAILED when BILLING_ENABLED is not 'true'", async () => {
    await expect(createCheckoutSession({
      db: fakeDb(null), paddle: fakePaddle(), env: { ...baseEnv, BILLING_ENABLED: "false" },
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("throws PRECONDITION_FAILED when user already has active pro sub", async () => {
    const row = {
      tier: "pro",
      billingProvider: "paddle",
      providerSubscriptionId: "sub_01",
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    }
    await expect(createCheckoutSession({
      db: fakeDb(row), paddle: fakePaddle(), env: baseEnv,
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("allows checkout when existing pro row is expired", async () => {
    const row = {
      tier: "pro",
      billingProvider: "paddle",
      providerSubscriptionId: "sub_old",
      expiresAt: new Date(Date.now() - 86400_000),
    }
    const out = await createCheckoutSession({
      db: fakeDb(row), paddle: fakePaddle(), env: baseEnv,
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })
    expect(out.url).toBe("https://pay.paddle.io/hsc_01")
  })
})

describe("createPortalSession", () => {
  it("returns portal url for user with active sub", async () => {
    const row = {
      providerCustomerId: "ctm_01",
      providerSubscriptionId: "sub_01",
      billingProvider: "paddle",
    }
    const out = await createPortalSession({
      db: fakeDb(row), paddle: fakePaddle(), env: baseEnv, userId: "u1",
    })
    expect(out.url).toBe("https://customer-portal.paddle.com/ptl_01")
  })

  it("passes subscription id to paddle client when present", async () => {
    const row = {
      providerCustomerId: "ctm_01",
      providerSubscriptionId: "sub_01",
      billingProvider: "paddle",
    }
    const paddle = fakePaddle()
    await createPortalSession({ db: fakeDb(row), paddle, env: baseEnv, userId: "u1" })
    expect(paddle.createPortalSession).toHaveBeenCalledWith({
      customerId: "ctm_01",
      subscriptionIds: ["sub_01"],
    })
  })

  it("throws PRECONDITION_FAILED when no provider_customer_id", async () => {
    await expect(createPortalSession({
      db: fakeDb(null), paddle: fakePaddle(), env: baseEnv, userId: "u1",
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })
})
