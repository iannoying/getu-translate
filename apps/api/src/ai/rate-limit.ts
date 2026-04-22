import { and, eq, gt, sql } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"

const { usageLog } = schema

export const RATE_LIMIT_PER_MINUTE = 300
export const RATE_LIMIT_WINDOW_MS = 60_000

export async function checkRateLimit(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS)
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(usageLog)
    .where(
      and(
        eq(usageLog.userId, userId),
        eq(usageLog.bucket, "ai_rate_limit"),
        gt(usageLog.createdAt, cutoff),
      ),
    )
    .get()
  const used = Number(row?.n ?? 0)
  if (used >= RATE_LIMIT_PER_MINUTE) return false

  // Record this request. `request_id` is random — does NOT interact with consumeQuota idempotency
  // because rate-limit rows use bucket='ai_rate_limit' which consumeQuota never reads.
  await db.insert(usageLog).values({
    id: crypto.randomUUID(),
    userId,
    bucket: "ai_rate_limit",
    amount: 1,
    requestId: crypto.randomUUID(),
    createdAt: now,
  })

  return true
}
