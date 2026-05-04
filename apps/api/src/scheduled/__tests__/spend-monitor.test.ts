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
})
