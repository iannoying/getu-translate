import { os } from "@orpc/server"
export { authed } from "./context"
export type { Ctx } from "./context"
import type { Ctx } from "./context"
import { billingRouter } from "./billing"
import { translateRouter } from "./translate"

export const router = os.$context<Ctx>().router({
  billing: billingRouter,
  translate: translateRouter,
})
export type Router = typeof router
