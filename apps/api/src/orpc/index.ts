import { os } from "@orpc/server"
export { authed } from "./context"
export type { Ctx } from "./context"
import type { Ctx } from "./context"
import { billingRouter } from "./billing"

export const router = os.$context<Ctx>().router({
  billing: billingRouter,
})
export type Router = typeof router
