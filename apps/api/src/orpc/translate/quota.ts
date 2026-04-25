import { ORPCError } from "@orpc/server"
import type { Db } from "@getu/db"
import type { QuotaBucket } from "@getu/contract"
import { consumeQuota } from "../../billing/quota"
import type { Plan } from "./models"

/** Per-plan max input length for /translate text input (UTF-16 code units). */
export const TRANSLATE_CHAR_LIMITS: Record<Plan, number> = {
  free: 2_000,
  pro: 20_000,
  enterprise: 20_000,
}

/**
 * Validate input length against per-plan cap. Throws `BAD_REQUEST` with
 * code `CHAR_LIMIT_EXCEEDED` so the client can surface the upgrade prompt.
 */
export function requireCharLimit(plan: Plan, text: string): void {
  const limit = TRANSLATE_CHAR_LIMITS[plan]
  if (text.length > limit) {
    throw new ORPCError("BAD_REQUEST", {
      message: `输入超出 ${text.length - limit} 字符（${plan === "free" ? "免费" : "Pro"} 上限 ${limit}）`,
      data: {
        code: "CHAR_LIMIT_EXCEEDED",
        length: text.length,
        limit,
        plan,
      },
    })
  }
}

/**
 * Atomic quota check + decrement, sharing the existing `consumeQuota`
 * accounting (quotaPeriod table + usageLog audit). Throws the wrapped
 * `INSUFFICIENT_QUOTA` ORPCError on overflow.
 */
export async function consumeTranslateQuota(
  db: Db,
  userId: string,
  bucket: QuotaBucket,
  amount: number,
  requestId: string,
  now?: Date,
): Promise<void> {
  await consumeQuota(db, userId, bucket, amount, requestId, now)
}
