import { z } from "zod"
import { createDb } from "@getu/db"
import {
  consumeQuotaInputSchema,
  consumeQuotaOutputSchema,
  createCheckoutSessionInputSchema,
  createCheckoutSessionOutputSchema,
  createPortalSessionOutputSchema,
} from "@getu/contract"
import { loadEntitlements } from "../billing/entitlements"
import { consumeQuota as consumeQuotaImpl } from "../billing/quota"
import { createPaddleClient } from "../billing/paddle/client"
import { createStripeClient } from "../billing/stripe/client"
import { createCheckoutSession as createCheckoutImpl, createPortalSession as createPortalImpl } from "../billing/checkout"
import { authed } from "./context"

export const billingRouter = {
  getEntitlements: authed.handler(async ({ context }) => {
    const db = createDb(context.env.DB)
    const enabled = context.env.BILLING_ENABLED === "true"
    return loadEntitlements(db, context.session.user.id, enabled)
  }),
  consumeQuota: authed
    .input(consumeQuotaInputSchema)
    .output(consumeQuotaOutputSchema)
    .handler(async ({ context, input }) => {
      const db = createDb(context.env.DB)
      return consumeQuotaImpl(
        db,
        context.session.user.id,
        input.bucket,
        input.amount,
        input.request_id,
      )
    }),
  createCheckoutSession: authed
    .input(createCheckoutSessionInputSchema)
    .output(createCheckoutSessionOutputSchema)
    .handler(async ({ context, input }) => {
      const db = createDb(context.env.DB)
      const paddle = createPaddleClient({
        apiKey: context.env.PADDLE_API_KEY,
        baseUrl: context.env.PADDLE_BASE_URL,
      })
      const stripe = createStripeClient({
        apiKey: context.env.STRIPE_SECRET_KEY,
        baseUrl: context.env.STRIPE_BASE_URL,
      })
      return createCheckoutImpl({
        db,
        paddle,
        stripe,
        env: context.env,
        userId: context.session.user.id,
        userEmail: context.session.user.email,
        input,
      })
    }),
  createPortalSession: authed
    .input(z.object({}).strict())
    .output(createPortalSessionOutputSchema)
    .handler(async ({ context }) => {
      const db = createDb(context.env.DB)
      const paddle = createPaddleClient({
        apiKey: context.env.PADDLE_API_KEY,
        baseUrl: context.env.PADDLE_BASE_URL,
      })
      const stripe = createStripeClient({
        apiKey: context.env.STRIPE_SECRET_KEY,
        baseUrl: context.env.STRIPE_BASE_URL,
      })
      return createPortalImpl({ db, paddle, stripe, env: context.env, userId: context.session.user.id })
    }),
}
