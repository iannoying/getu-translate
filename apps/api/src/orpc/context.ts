import { os, ORPCError } from "@orpc/server"
import type { WorkerEnv } from "../env"
import { createAuth } from "../auth"

export interface Ctx {
  env: WorkerEnv
  auth: ReturnType<typeof createAuth>
  session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>> | null
}

export const authed = os.$context<Ctx>().use(async ({ context, next }) => {
  if (context.session == null) throw new ORPCError("UNAUTHORIZED")
  return next({ context: { ...context, session: context.session } })
})
