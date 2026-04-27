import { os, ORPCError } from "@orpc/server"
import type { WorkerEnv } from "../env"
import { createAuth } from "../auth"

export interface Ctx {
  env: WorkerEnv
  auth: ReturnType<typeof createAuth>
  session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>> | null
  /** Cloudflare ExecutionContext — optional so tests don't have to provide it. */
  executionCtx?: ExecutionContext
}

export const authed = os.$context<Ctx>().use(async ({ context, next }) => {
  if (context.session == null) throw new ORPCError("UNAUTHORIZED")
  return next({ context: { ...context, session: context.session } })
})
