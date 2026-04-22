import { describe, expect, it } from "vitest"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { runRetention } from "../retention"
import { schema } from "@getu/db"

const NOW_MS = new Date("2026-04-22T03:00:00.000Z").getTime()
// 31 days ago — beyond the 30-day retention window
const OLD_MS = new Date("2026-03-22T03:00:00.000Z").getTime()
// 5 days ago — within retention window
const RECENT_MS = new Date("2026-04-17T03:00:00.000Z").getTime()

describe("runRetention", () => {
  it("deletes usage_log rows older than retentionDays and keeps recent ones", async () => {
    const { db } = makeTestDb()

    // usage_log.userId is nullable so we can insert without a user FK
    await db.insert(schema.usageLog).values([
      {
        id: "old-1",
        userId: null,
        bucket: "ai_translate_monthly",
        amount: 100,
        requestId: "req-old-1",
        createdAt: new Date(OLD_MS),
      },
      {
        id: "recent-1",
        userId: null,
        bucket: "ai_translate_monthly",
        amount: 200,
        requestId: "req-recent-1",
        createdAt: new Date(RECENT_MS),
      },
    ])

    await runRetention(db as any, { now: NOW_MS, retentionDays: 30 })

    const remaining = await db.select().from(schema.usageLog)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe("recent-1")
  })

  it("deletes billing_webhook_events rows older than retentionDays", async () => {
    const { db } = makeTestDb()

    await db.insert(schema.billingWebhookEvents).values([
      {
        eventId: "evt-old",
        provider: "paddle",
        eventType: "subscription.created",
        receivedAt: new Date(OLD_MS),
        status: "processed",
        payloadJson: "{}",
      },
      {
        eventId: "evt-recent",
        provider: "paddle",
        eventType: "subscription.updated",
        receivedAt: new Date(RECENT_MS),
        status: "processed",
        payloadJson: "{}",
      },
    ])

    await runRetention(db as any, { now: NOW_MS, retentionDays: 30 })

    const remaining = await db.select().from(schema.billingWebhookEvents)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.eventId).toBe("evt-recent")
  })

  it("deletes nothing when all rows are within retentionDays", async () => {
    const { db } = makeTestDb()

    await db.insert(schema.usageLog).values([
      {
        id: "fresh-1",
        userId: null,
        bucket: "ai_translate_monthly",
        amount: 10,
        requestId: "req-fresh-1",
        createdAt: new Date(RECENT_MS),
      },
    ])

    await runRetention(db as any, { now: NOW_MS, retentionDays: 30 })

    const remaining = await db.select().from(schema.usageLog)
    expect(remaining).toHaveLength(1)
  })

  it("deletes all rows when all are older than retentionDays", async () => {
    const { db } = makeTestDb()

    await db.insert(schema.usageLog).values([
      {
        id: "old-a",
        userId: null,
        bucket: "ai_translate_monthly",
        amount: 5,
        requestId: "req-old-a",
        createdAt: new Date(OLD_MS),
      },
      {
        id: "old-b",
        userId: null,
        bucket: "ai_translate_monthly",
        amount: 5,
        requestId: "req-old-b",
        createdAt: new Date(OLD_MS),
      },
    ])

    await runRetention(db as any, { now: NOW_MS, retentionDays: 30 })

    const remaining = await db.select().from(schema.usageLog)
    expect(remaining).toHaveLength(0)
  })
})
