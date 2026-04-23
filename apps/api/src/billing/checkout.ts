import { ORPCError } from "@orpc/server"
import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { CreateCheckoutSessionInput } from "@getu/contract"
import type { PaddleClient } from "./paddle/client"
import type { StripeClient } from "./stripe/client"
import type { WorkerEnv } from "../env"

const { userEntitlements } = schema

interface CheckoutDeps {
  db: Db
  paddle: PaddleClient
  stripe: StripeClient
  env: WorkerEnv
  userId: string
  userEmail: string
  input: CreateCheckoutSessionInput
}

export async function createCheckoutSession(deps: CheckoutDeps): Promise<{ url: string }> {
  const { db, paddle, stripe, env, userId, userEmail, input } = deps

  if (env.BILLING_ENABLED !== "true") {
    throw new ORPCError("PRECONDITION_FAILED", { message: "Billing is not enabled" })
  }

  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  const expiresAtMs = row?.expiresAt instanceof Date
    ? row.expiresAt.getTime()
    : (row?.expiresAt as number | null | undefined) ?? null
  const hasActiveSub = row?.tier === "pro"
    && !!row.providerSubscriptionId
    && (expiresAtMs == null || expiresAtMs > Date.now())
  if (hasActiveSub) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "User already has an active Pro subscription; use createPortalSession instead",
    })
  }

  if (input.provider === "stripe") {
    const paymentMethod = input.paymentMethod ?? "card"

    if (paymentMethod === "alipay" || paymentMethod === "wechat_pay") {
      const amountCents = input.plan === "pro_monthly" ? 800 : 7200
      const durationDays = input.plan === "pro_monthly" ? 30 : 365
      const productName = input.plan === "pro_monthly"
        ? "GetU Pro — 1 month"
        : "GetU Pro — 1 year"
      const { checkoutUrl } = await stripe.createOneTimePaymentSession({
        method: paymentMethod,
        amountCents,
        currency: "usd",
        productName,
        email: userEmail,
        userId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        durationDays,
      })
      return { url: checkoutUrl }
    }

    const priceId = input.plan === "pro_monthly"
      ? env.STRIPE_PRICE_PRO_MONTHLY
      : env.STRIPE_PRICE_PRO_YEARLY
    if (!priceId) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Stripe price id not configured for plan ${input.plan}`,
      })
    }
    const { checkoutUrl } = await stripe.createCheckoutSession({
      priceId,
      email: userEmail,
      userId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    })
    return { url: checkoutUrl }
  }

  // default: paddle (existing path)
  const priceId = input.plan === "pro_monthly"
    ? env.PADDLE_PRICE_PRO_MONTHLY
    : env.PADDLE_PRICE_PRO_YEARLY
  // Guard against unset/empty secret — without this we'd pass "" to Paddle
  // and surface a generic "Paddle API 400" instead of a clear config error.
  if (!priceId) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: `Paddle price id not configured for plan ${input.plan}`,
    })
  }

  const { checkoutUrl } = await paddle.createTransaction({
    priceId,
    email: userEmail,
    userId,
    successUrl: input.successUrl,
  })
  return { url: checkoutUrl }
}

interface PortalDeps {
  db: Db
  paddle: PaddleClient
  stripe: StripeClient
  env: WorkerEnv
  userId: string
}

export async function createPortalSession(deps: PortalDeps): Promise<{ url: string }> {
  const { db, paddle, stripe, userId } = deps
  const row = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).get()
  if (!row?.providerCustomerId) {
    throw new ORPCError("PRECONDITION_FAILED", { message: "No billing customer on file" })
  }
  if (row.billingProvider === "stripe") {
    return stripe.createPortalSession({
      customerId: row.providerCustomerId,
      returnUrl: "https://getutranslate.com/account",
    })
  }
  if (row.billingProvider === "paddle") {
    return paddle.createPortalSession({
      customerId: row.providerCustomerId,
      subscriptionIds: row.providerSubscriptionId ? [row.providerSubscriptionId] : undefined,
    })
  }
  throw new ORPCError("PRECONDITION_FAILED", { message: "Unknown billing provider" })
}
