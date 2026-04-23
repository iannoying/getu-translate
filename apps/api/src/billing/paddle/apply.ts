import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { BillingEvent } from "./events"

const PRO_FEATURES = [
  "pdf_translate",
  "pdf_translate_unlimited",
  "pdf_translate_export",
  "input_translate_unlimited",
  "vocab_unlimited",
  "vocab_cloud_sync",
  "ai_translate_pool",
  "subtitle_platforms_extended",
]

export async function applyBillingEvent(db: Db, evt: BillingEvent, provider: "paddle" | "stripe" = "paddle"): Promise<void> {
  if (evt.kind === "ignored") return

  const { userEntitlements } = schema
  const now = new Date()

  switch (evt.kind) {
    case "subscription_activated": {
      await db.insert(userEntitlements).values({
        userId: evt.userId,
        tier: "pro",
        features: JSON.stringify(PRO_FEATURES),
        expiresAt: new Date(evt.expiresAt),
        providerCustomerId: evt.customerId,
        providerSubscriptionId: evt.subscriptionId,
        billingProvider: provider,
        graceUntil: null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: userEntitlements.userId,
        set: {
          tier: "pro",
          features: JSON.stringify(PRO_FEATURES),
          expiresAt: new Date(evt.expiresAt),
          providerCustomerId: evt.customerId,
          providerSubscriptionId: evt.subscriptionId,
          billingProvider: provider,
          graceUntil: null,
          updatedAt: now,
        },
      })
      break
    }
    case "subscription_updated": {
      await db.update(userEntitlements)
        .set({
          expiresAt: new Date(evt.expiresAt),
          updatedAt: now,
        })
        .where(eq(userEntitlements.userId, evt.userId))
      break
    }
    case "subscription_canceled": {
      await db.update(userEntitlements)
        .set({
          tier: "free",
          features: JSON.stringify([]),
          expiresAt: null,
          providerSubscriptionId: null,
          graceUntil: null,
          updatedAt: now,
        })
        .where(eq(userEntitlements.userId, evt.userId))
      break
    }
    case "payment_past_due": {
      await db.update(userEntitlements)
        .set({
          graceUntil: new Date(evt.graceUntil),
          updatedAt: now,
        })
        .where(eq(userEntitlements.userId, evt.userId))
      break
    }
    case "payment_succeeded": {
      await db.update(userEntitlements)
        .set({
          graceUntil: null,
          updatedAt: now,
        })
        .where(eq(userEntitlements.userId, evt.userId))
      break
    }
  }
}
