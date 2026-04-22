import { createDb } from "@getu/db"
import { loadEntitlements } from "../billing/entitlements"
import { authed } from "./context"

export const billingRouter = {
  getEntitlements: authed.handler(async ({ context }) => {
    const db = createDb(context.env.DB)
    return loadEntitlements(db, context.session.user.id)
  }),
}
