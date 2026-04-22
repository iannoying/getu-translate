import { lt } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"

export async function runRetention(db: Db, opts: { now: number; retentionDays: number }) {
  const cutoff = new Date(opts.now - opts.retentionDays * 86400_000)
  await db.delete(schema.usageLog).where(lt(schema.usageLog.createdAt, cutoff))
  await db.delete(schema.billingWebhookEvents).where(lt(schema.billingWebhookEvents.receivedAt, cutoff))
}
