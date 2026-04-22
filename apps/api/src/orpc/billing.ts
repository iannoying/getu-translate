import { createDb } from "@getu/db"
import { consumeQuotaInputSchema, consumeQuotaOutputSchema } from "@getu/contract"
import { loadEntitlements } from "../billing/entitlements"
import { consumeQuota as consumeQuotaImpl } from "../billing/quota"
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
}
