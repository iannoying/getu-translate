import { and, gte, lt, sql } from "drizzle-orm"
import type { Db } from "@getu/db"
import { schema } from "@getu/db"
import type { QuotaBucket } from "@getu/contract"
import type { WorkerEnv } from "../env"

const DAY_MS = 24 * 60 * 60_000

type ThresholdConfig = {
  bucket: SpendMonitorBucket
  envVar: string
}

type SpendMonitorBucket = QuotaBucket | "ai_rate_limit"

type ParsedThreshold = ThresholdConfig & {
  threshold: number
}

export type SpendBreach = {
  bucket: string
  envVar: string
  actual: number
  threshold: number
}

export type SpendMonitorResult = {
  checked: number
  alerted: number
  breaches: SpendBreach[]
  skippedReason?: "no_thresholds" | "no_webhook"
  error?: string
}

const THRESHOLDS: ThresholdConfig[] = [
  { bucket: "ai_translate_monthly", envVar: "SPEND_ALERT_AI_TRANSLATE_PER_DAY" },
  { bucket: "web_text_translate_monthly", envVar: "SPEND_ALERT_WEB_TEXT_TRANSLATE_PER_DAY" },
  { bucket: "web_text_translate_token_monthly", envVar: "SPEND_ALERT_WEB_TEXT_TRANSLATE_TOKENS_PER_DAY" },
  { bucket: "web_pdf_translate_monthly", envVar: "SPEND_ALERT_DOCUMENT_PAGES_PER_DAY" },
  { bucket: "ai_rate_limit", envVar: "SPEND_ALERT_AI_RATE_LIMIT_WRITES_PER_DAY" },
]

export async function runSpendMonitor(
  db: Db,
  env: WorkerEnv,
  opts: { now: number; fetch?: typeof fetch; dryRun?: boolean },
): Promise<SpendMonitorResult> {
  const thresholds = parseThresholds(env)
  if (thresholds.length === 0) return { checked: 0, alerted: 0, breaches: [], skippedReason: "no_thresholds" }

  const totals = await loadUsageTotals(db, opts.now)
  const breaches = thresholds
    .map(({ bucket, envVar, threshold }) => ({
      bucket,
      envVar,
      actual: totals.get(bucket) ?? 0,
      threshold,
    }))
    .filter((entry) => entry.actual > entry.threshold)

  if (breaches.length === 0) return { checked: thresholds.length, alerted: 0, breaches: [] }

  const slackWebhookUrl = getEnvString(env, "SLACK_WEBHOOK_URL")
  if (!slackWebhookUrl) {
    return { checked: thresholds.length, alerted: 0, breaches, skippedReason: "no_webhook" }
  }

  if (opts.dryRun) return { checked: thresholds.length, alerted: breaches.length, breaches }

  const fetchImpl = opts.fetch ?? fetch
  let response: Response
  try {
    response = await fetchImpl(slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildSlackPayload(breaches, opts.now)),
    })
  } catch (err) {
    return {
      checked: thresholds.length,
      alerted: 0,
      breaches,
      error: `slack webhook failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!response.ok) {
    return {
      checked: thresholds.length,
      alerted: 0,
      breaches,
      error: `slack webhook returned ${response.status}`,
    }
  }

  return { checked: thresholds.length, alerted: breaches.length, breaches }
}

function parseThresholds(env: WorkerEnv): ParsedThreshold[] {
  return THRESHOLDS.flatMap(({ bucket, envVar }) => {
    const raw = getEnvString(env, envVar)
    const threshold = typeof raw === "string" ? Number(raw) : NaN
    if (!Number.isFinite(threshold) || threshold <= 0) return []
    return [{ bucket, envVar, threshold }]
  })
}

async function loadUsageTotals(db: Db, now: number): Promise<Map<string, number>> {
  const since = new Date(now - DAY_MS)
  const before = new Date(now)
  const rows = await db
    .select({
      bucket: schema.usageLog.bucket,
      total: sql<number>`sum(${schema.usageLog.amount})`,
    })
    .from(schema.usageLog)
    .where(and(gte(schema.usageLog.createdAt, since), lt(schema.usageLog.createdAt, before)))
    .groupBy(schema.usageLog.bucket)

  return new Map(rows.map((row) => [row.bucket, Number(row.total ?? 0)]))
}

function buildSlackPayload(breaches: SpendBreach[], now: number) {
  const lines = breaches.map(
    (b) => `- ${b.bucket}: ${b.actual.toLocaleString("en-US")} > ${b.threshold.toLocaleString("en-US")} (${b.envVar})`,
  )
  return {
    text: `GetU spend alert: ${breaches.length} bucket(s) exceeded daily thresholds`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*GetU spend alert*\nWindow ending: ${new Date(now).toISOString()}\n${lines.join("\n")}`,
        },
      },
    ],
  }
}

function getEnvString(env: WorkerEnv, key: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}
