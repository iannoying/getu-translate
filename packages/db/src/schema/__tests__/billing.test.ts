import { describe, expect, it } from "vitest"
import { userEntitlements, billingWebhookEvents } from "../billing"
import { getTableColumns } from "drizzle-orm"

describe("billing schema v2", () => {
  it("userEntitlements has provider_* columns (not stripe_*)", () => {
    const cols = Object.keys(getTableColumns(userEntitlements))
    expect(cols).toContain("providerCustomerId")
    expect(cols).toContain("providerSubscriptionId")
    expect(cols).toContain("billingProvider")
    expect(cols).not.toContain("stripeCustomerId")
    expect(cols).not.toContain("stripeSubscriptionId")
  })

  it("billingWebhookEvents table is defined with expected columns", () => {
    const cols = Object.keys(getTableColumns(billingWebhookEvents))
    expect(cols).toEqual(expect.arrayContaining([
      "eventId", "provider", "eventType", "receivedAt",
      "processedAt", "status", "errorMessage", "payloadJson",
    ]))
  })
})
