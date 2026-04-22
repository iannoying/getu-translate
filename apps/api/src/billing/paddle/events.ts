export type BillingEvent =
  | { kind: "subscription_activated"; userId: string; customerId: string; subscriptionId: string; expiresAt: number; priceId: string }
  | { kind: "subscription_updated"; userId: string; subscriptionId: string; expiresAt: number; priceId: string }
  | { kind: "subscription_canceled"; userId: string; subscriptionId: string }
  | { kind: "payment_past_due"; userId: string; subscriptionId: string; graceUntil: number }
  | { kind: "payment_succeeded"; userId: string; subscriptionId: string }
  | { kind: "ignored"; reason: string }

export function normalizePaddleEvent(evt: any): BillingEvent {
  const t = evt?.event_type as string | undefined
  const data = evt?.data ?? {}
  const userId = data?.custom_data?.user_id as string | undefined
  if (!t) return { kind: "ignored", reason: "no event_type" }

  const subEndsAt = data?.current_billing_period?.ends_at
  const expiresAt = subEndsAt ? new Date(subEndsAt).getTime() : 0
  const priceId = data?.items?.[0]?.price?.id ?? ""
  // past_due can fire AFTER current_billing_period has already ended, so
  // anchor grace to event occurrence time, not period end.
  const occurredAt = evt?.occurred_at ? new Date(evt.occurred_at).getTime() : Date.now()

  switch (t) {
    case "subscription.activated":
    case "subscription.created":
      if (!userId) return { kind: "ignored", reason: "missing custom_data.user_id" }
      return {
        kind: "subscription_activated",
        userId, customerId: data.customer_id, subscriptionId: data.id,
        expiresAt, priceId,
      }
    case "subscription.updated":
      if (!userId) return { kind: "ignored", reason: "missing custom_data.user_id" }
      return { kind: "subscription_updated", userId, subscriptionId: data.id, expiresAt, priceId }
    case "subscription.canceled":
      if (!userId) return { kind: "ignored", reason: "missing custom_data.user_id" }
      return { kind: "subscription_canceled", userId, subscriptionId: data.id }
    case "subscription.past_due":
    case "subscription.paused":
      if (!userId) return { kind: "ignored", reason: "missing custom_data.user_id" }
      return { kind: "payment_past_due", userId, subscriptionId: data.id, graceUntil: occurredAt + 7 * 86400_000 }
    case "transaction.completed":
      if (!userId) return { kind: "ignored", reason: "missing custom_data.user_id" }
      return {
        kind: "payment_succeeded",
        userId,
        subscriptionId: data.subscription_id ?? data.id,
      }
    default:
      return { kind: "ignored", reason: `unhandled event_type ${t}` }
  }
}
