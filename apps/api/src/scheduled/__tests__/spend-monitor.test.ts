import { describe, expect, it, vi } from "vitest"
import { schema } from "@getu/db"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { runSpendMonitor } from "../spend-monitor"
import type { WorkerEnv } from "../../env"

const NOW_MS = new Date("2026-05-05T03:00:00.000Z").getTime()
const ONE_HOUR_AGO = new Date(NOW_MS - 60 * 60_000)
const TWENTY_FIVE_HOURS_AGO = new Date(NOW_MS - 25 * 60 * 60_000)

type SpendMonitorEnvOverrides = Partial<WorkerEnv> & Record<string, string | undefined>

function env(overrides: SpendMonitorEnvOverrides = {}): WorkerEnv {
  return {
    SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY: "500",
    SPEND_ALERT_DOCUMENT_PAGES_PER_DAY: "200",
    ...overrides,
  } as WorkerEnv
}

describe("runSpendMonitor", () => {
  it("aggregates usage_log amounts by bucket over the previous 24 hours", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values([
      {
        id: "recent-token-a",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 250,
        requestId: "recent-token-a",
        createdAt: ONE_HOUR_AGO,
      },
      {
        id: "recent-token-b",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 251,
        requestId: "recent-token-b",
        createdAt: ONE_HOUR_AGO,
      },
      {
        id: "old-token",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 999_999,
        requestId: "old-token",
        createdAt: TWENTY_FIVE_HOURS_AGO,
      },
      {
        id: "recent-document",
        userId: null,
        bucket: "web_pdf_translate_monthly",
        amount: 199,
        requestId: "recent-document",
        createdAt: ONE_HOUR_AGO,
      },
    ])

    const result = await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    expect(result.checked).toBe(2)
    expect(result.alerted).toBe(1)
    expect(result.breaches).toEqual([
      {
        bucket: "web_text_translate_token_monthly",
        envVar: "SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY",
        actual: 501,
        threshold: 500,
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not alert below or exactly at threshold", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values([
      {
        id: "exact-token",
        userId: null,
        bucket: "web_text_translate_token_monthly",
        amount: 500,
        requestId: "exact-token",
        createdAt: ONE_HOUR_AGO,
      },
      {
        id: "below-document",
        userId: null,
        bucket: "web_pdf_translate_monthly",
        amount: 199,
        requestId: "below-document",
        createdAt: ONE_HOUR_AGO,
      },
    ])

    const result = await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    expect(result.alerted).toBe(0)
    expect(result.breaches).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("renders a clean Slack message with bucket name, threshold, and actual value", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values({
      id: "token-breach",
      userId: null,
      bucket: "web_text_translate_token_monthly",
      amount: 1_234_567,
      requestId: "token-breach",
      createdAt: ONE_HOUR_AGO,
    })

    await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init?.body))

    expect(body.text).toContain("GetU spend alert")
    expect(body.blocks[0].text.text).toContain("web_text_translate_token_monthly")
    expect(body.blocks[0].text.text).toContain("1,234,567")
    expect(body.blocks[0].text.text).toContain("500")
    expect(body.blocks[0].text.text).toContain("SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY")
  })

  it("returns breaches without posting when Slack webhook is not configured", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("ok"))

    await db.insert(schema.usageLog).values({
      id: "token-no-webhook",
      userId: null,
      bucket: "web_text_translate_token_monthly",
      amount: 501,
      requestId: "token-no-webhook",
      createdAt: ONE_HOUR_AGO,
    })

    const result = await runSpendMonitor(db as any, env(), { now: NOW_MS, fetch: fetchMock })

    expect(result.skippedReason).toBe("no_webhook")
    expect(result.alerted).toBe(0)
    expect(result.breaches).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("disables invalid thresholds and reports no_thresholds when none remain", async () => {
    const { db } = makeTestDb()

    const result = await runSpendMonitor(
      db as any,
      env({
        SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY: "not-a-number",
        SPEND_ALERT_DOCUMENT_PAGES_PER_DAY: "0",
      }),
      { now: NOW_MS },
    )

    expect(result).toEqual({ checked: 0, alerted: 0, breaches: [], skippedReason: "no_thresholds" })
  })

  it("reports Slack webhook failures without throwing", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => new Response("bad", { status: 500 }))

    await db.insert(schema.usageLog).values({
      id: "token-slack-fail",
      userId: null,
      bucket: "web_text_translate_token_monthly",
      amount: 501,
      requestId: "token-slack-fail",
      createdAt: ONE_HOUR_AGO,
    })

    const result = await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    expect(result.alerted).toBe(0)
    expect(result.error).toBe("slack webhook returned 500")
  })

  it("reports Slack fetch rejections without throwing", async () => {
    const { db } = makeTestDb()
    const fetchMock = vi.fn(async () => {
      throw new Error("dns lookup failed")
    })

    await db.insert(schema.usageLog).values({
      id: "token-slack-reject",
      userId: null,
      bucket: "web_text_translate_token_monthly",
      amount: 501,
      requestId: "token-slack-reject",
      createdAt: ONE_HOUR_AGO,
    })

    const result = await runSpendMonitor(db as any, env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/getu" }), {
      now: NOW_MS,
      fetch: fetchMock,
    })

    expect(result.alerted).toBe(0)
    expect(result.breaches).toHaveLength(1)
    expect(result.error).toBe("slack webhook failed: dns lookup failed")
  })
})
