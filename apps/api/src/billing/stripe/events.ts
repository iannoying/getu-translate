import type { BillingEvent } from "../paddle/events"

export type StripeNormalized =
  | BillingEvent
  | { kind: "needs_lookup"; eventType: string; subscriptionId: string; customerId: string; data: any }

export function normalizeStripeEvent(evt: any, opts?: { userId?: string }): StripeNormalized {
  const t = evt?.type as string | undefined
  const data = evt?.data?.object ?? {}
  const createdMs = (evt?.created ?? 0) * 1000
  if (!t) return { kind: "ignored", reason: "no type" }

  switch (t) {
    case "checkout.session.completed": {
      const userId = opts?.userId ?? (data.client_reference_id as string | undefined) ?? (data.metadata?.user_id as string | undefined)
      if (!userId) return { kind: "ignored", reason: "missing client_reference_id" }

      if (data.mode === "payment") {
        const durationDays = parseInt(data.metadata?.duration_days ?? "0", 10)
        return {
          kind: "one_time_purchase_completed",
          userId,
          customerId: data.customer,
          durationDays,
          amountCents: data.amount_total ?? 0,
        }
      }

      // expiresAt = 0 placeholder; will be filled by subsequent customer.subscription.updated
      return {
        kind: "subscription_activated",
        userId,
        customerId: data.customer,
        subscriptionId: data.subscription,
        expiresAt: 0,
        priceId: "",
      }
    }
    case "customer.subscription.updated": {
      const subscriptionId = data.id as string
      const customerId = data.customer as string
      const userId = opts?.userId
      if (!userId) return { kind: "needs_lookup", eventType: t, subscriptionId, customerId, data: evt.data }
      const expiresAt = (data.current_period_end ?? 0) * 1000
      const priceId = data.items?.data?.[0]?.price?.id ?? ""
      return { kind: "subscription_updated", userId, subscriptionId, expiresAt, priceId }
    }
    case "customer.subscription.deleted": {
      const subscriptionId = data.id as string
      const customerId = data.customer as string
      const userId = opts?.userId
      if (!userId) return { kind: "needs_lookup", eventType: t, subscriptionId, customerId, data: evt.data }
      return { kind: "subscription_canceled", userId, subscriptionId }
    }
    case "invoice.payment_failed": {
      const subscriptionId = data.subscription as string
      const customerId = data.customer as string
      const userId = opts?.userId
      if (!userId) return { kind: "needs_lookup", eventType: t, subscriptionId, customerId, data: evt.data }
      return { kind: "payment_past_due", userId, subscriptionId, graceUntil: createdMs + 7 * 86400_000 }
    }
    case "invoice.payment_succeeded": {
      const subscriptionId = data.subscription as string
      const customerId = data.customer as string
      const userId = opts?.userId
      if (!userId) return { kind: "needs_lookup", eventType: t, subscriptionId, customerId, data: evt.data }
      return { kind: "payment_succeeded", userId, subscriptionId }
    }
    default:
      return { kind: "ignored", reason: `unhandled type ${t}` }
  }
}
