import { FREE_ENTITLEMENTS } from "@getu/contract"
import { authed } from "./context"

export const billingRouter = {
  getEntitlements: authed.handler(async () => FREE_ENTITLEMENTS),
}
