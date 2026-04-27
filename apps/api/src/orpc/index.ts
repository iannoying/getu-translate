import { os } from "@orpc/server"
export { authed } from "./context"
export type { Ctx } from "./context"
import type { Ctx } from "./context"
import { billingRouter } from "./billing"
import { translateRouter } from "./translate"
import { analyticsRouter } from "./analytics"

export const router = os.$context<Ctx>().router({
  billing: billingRouter,
  translate: translateRouter,
  analytics: analyticsRouter,
})
export type Router = typeof router
