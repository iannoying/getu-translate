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

function fakeStripe(overrides: any = {}) {
  return {
    createCheckoutSession: vi.fn().mockResolvedValue({
      sessionId: "cs_01", checkoutUrl: "https://checkout.stripe.com/pay/cs_01",
    }),
    createOneTimePaymentSession: vi.fn().mockResolvedValue({
      sessionId: "cs_pay_01", checkoutUrl: "https://checkout.stripe.com/pay/cs_pay_01",
    }),
    createPortalSession: vi.fn().mockResolvedValue({
      url: "https://billing.stripe.com/session/bps_01",
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
  STRIPE_SECRET_KEY: "sk_test_k",
  STRIPE_BASE_URL: "https://api.stripe.com",
  STRIPE_PRICE_PRO_MONTHLY: "price_m",
  STRIPE_PRICE_PRO_YEARLY: "price_y",
}

describe("createCheckoutSession", () => {
  it("returns paddle checkout url for fresh user", async () => {
    const paddle = fakePaddle()
    const out = await createCheckoutSession({
      db: fakeDb(null),
      paddle,
      stripe: fakeStripe(),
      env: baseEnv,
      userId: "u1",
      userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "paddle" as const,
        paymentMethod: "card" as const,
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
      db: fakeDb(null), paddle, stripe: fakeStripe(), env: baseEnv, userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_yearly",
        provider: "paddle" as const,
        paymentMethod: "card" as const,
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })
    expect(paddle.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ priceId: "pri_y" }))
  })

  it("throws PRECONDITION_FAILED when BILLING_ENABLED is not 'true'", async () => {
    await expect(createCheckoutSession({
      db: fakeDb(null), paddle: fakePaddle(), stripe: fakeStripe(),
      env: { ...baseEnv, BILLING_ENABLED: "false" },
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "paddle" as const,
        paymentMethod: "card" as const,
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
      db: fakeDb(row), paddle: fakePaddle(), stripe: fakeStripe(), env: baseEnv,
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "paddle" as const,
        paymentMethod: "card" as const,
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("throws INTERNAL_SERVER_ERROR when price id is not configured", async () => {
    await expect(createCheckoutSession({
      db: fakeDb(null), paddle: fakePaddle(), stripe: fakeStripe(),
      env: { ...baseEnv, PADDLE_PRICE_PRO_MONTHLY: "" },
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "paddle" as const,
        paymentMethod: "card" as const,
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
  })

  it("allows checkout when existing pro row is expired", async () => {
    const row = {
      tier: "pro",
      billingProvider: "paddle",
      providerSubscriptionId: "sub_old",
      expiresAt: new Date(Date.now() - 86400_000),
    }
    const out = await createCheckoutSession({
      db: fakeDb(row), paddle: fakePaddle(), stripe: fakeStripe(), env: baseEnv,
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "paddle" as const,
        paymentMethod: "card" as const,
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })
    expect(out.url).toBe("https://pay.paddle.io/hsc_01")
  })

  it("calls stripe.createCheckoutSession when provider=stripe", async () => {
    const stripe = fakeStripe()
    const out = await createCheckoutSession({
      db: fakeDb(null),
      paddle: fakePaddle(),
      stripe,
      env: baseEnv,
      userId: "u1",
      userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "stripe" as const,
        paymentMethod: "card" as const,
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
      },
    })
    expect(out.url).toBe("https://checkout.stripe.com/pay/cs_01")
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith({
      priceId: "price_m",
      email: "u@x.com",
      userId: "u1",
      successUrl: "https://getutranslate.com/upgrade/success",
      cancelUrl: "https://getutranslate.com/price",
    })
  })

  it("throws INTERNAL_SERVER_ERROR when stripe price id is not configured", async () => {
    await expect(createCheckoutSession({
      db: fakeDb(null), paddle: fakePaddle(), stripe: fakeStripe(),
      env: { ...baseEnv, STRIPE_PRICE_PRO_MONTHLY: "" },
      userId: "u1", userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "stripe" as const,
        paymentMethod: "card" as const,
        successUrl: "https://getutranslate.com/x",
        cancelUrl: "https://getutranslate.com/y",
      },
    })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
  })

  it("calls stripe.createOneTimePaymentSession with durationDays=30 for alipay pro_monthly", async () => {
    const stripe = fakeStripe()
    const out = await createCheckoutSession({
      db: fakeDb(null),
      paddle: fakePaddle(),
      stripe,
      env: baseEnv,
      userId: "u1",
      userEmail: "u@x.com",
      input: {
        plan: "pro_monthly",
        provider: "stripe" as const,
        paymentMethod: "alipay" as const,
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
      },
    })
    expect(out.url).toBe("https://checkout.stripe.com/pay/cs_pay_01")
    expect(stripe.createOneTimePaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({ method: "alipay", amountCents: 800, durationDays: 30 }),
    )
  })

  it("calls stripe.createOneTimePaymentSession with method=wechat_pay for wechat_pay", async () => {
    const stripe = fakeStripe()
    const out = await createCheckoutSession({
      db: fakeDb(null),
      paddle: fakePaddle(),
      stripe,
      env: baseEnv,
      userId: "u1",
      userEmail: "u@x.com",
      input: {
        plan: "pro_yearly",
        provider: "stripe" as const,
        paymentMethod: "wechat_pay" as const,
        successUrl: "https://getutranslate.com/upgrade/success",
        cancelUrl: "https://getutranslate.com/price",
      },
    })
    expect(out.url).toBe("https://checkout.stripe.com/pay/cs_pay_01")
    expect(stripe.createOneTimePaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({ method: "wechat_pay", amountCents: 7200, durationDays: 365 }),
    )
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
      db: fakeDb(row), paddle: fakePaddle(), stripe: fakeStripe(), env: baseEnv, userId: "u1",
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
    await createPortalSession({ db: fakeDb(row), paddle, stripe: fakeStripe(), env: baseEnv, userId: "u1" })
    expect(paddle.createPortalSession).toHaveBeenCalledWith({
      customerId: "ctm_01",
      subscriptionIds: ["sub_01"],
    })
  })

  it("omits subscription_ids when provider_subscription_id is null", async () => {
    const row = {
      providerCustomerId: "ctm_01",
      providerSubscriptionId: null,
      billingProvider: "paddle",
    }
    const paddle = fakePaddle()
    await createPortalSession({ db: fakeDb(row), paddle, stripe: fakeStripe(), env: baseEnv, userId: "u1" })
    expect(paddle.createPortalSession).toHaveBeenCalledWith({
      customerId: "ctm_01",
      subscriptionIds: undefined,
    })
  })

  it("calls stripe.createPortalSession when billingProvider=stripe", async () => {
    const row = {
      providerCustomerId: "cus_stripe_01",
      providerSubscriptionId: "sub_stripe_01",
      billingProvider: "stripe",
    }
    const stripe = fakeStripe()
    const out = await createPortalSession({
      db: fakeDb(row), paddle: fakePaddle(), stripe, env: baseEnv, userId: "u1",
    })
    expect(out.url).toBe("https://billing.stripe.com/session/bps_01")
    expect(stripe.createPortalSession).toHaveBeenCalledWith({
      customerId: "cus_stripe_01",
      returnUrl: "https://getutranslate.com/account",
    })
  })

  it("throws PRECONDITION_FAILED when billingProvider is unknown", async () => {
    const row = {
      providerCustomerId: "cus_x",
      providerSubscriptionId: null,
      billingProvider: "unknown_provider",
    }
    await expect(createPortalSession({
      db: fakeDb(row), paddle: fakePaddle(), stripe: fakeStripe(), env: baseEnv, userId: "u1",
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("throws PRECONDITION_FAILED when no provider_customer_id", async () => {
    await expect(createPortalSession({
      db: fakeDb(null), paddle: fakePaddle(), stripe: fakeStripe(), env: baseEnv, userId: "u1",
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })
})
