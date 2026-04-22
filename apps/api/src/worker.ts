import app from "./index"
import { createDb } from "@getu/db"
import { runRetention } from "./scheduled/retention"
import type { WorkerEnv } from "./env"

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    const db = createDb(env.DB)
    ctx.waitUntil(runRetention(db, { now: Date.now(), retentionDays: 30 }))
  },
} satisfies ExportedHandler<WorkerEnv>
