import { ORPCError } from "@orpc/server"
import { and, desc, eq, lt } from "drizzle-orm"
import { createDb } from "@getu/db"
import { schema } from "@getu/db"
import {
  listHistoryInputSchema,
  listHistoryOutputSchema,
  saveHistoryInputSchema,
  saveHistoryOutputSchema,
  translateTextInputSchema,
  translateTextOutputSchema,
} from "@getu/contract"
import { TRANSLATE_MODEL_BY_ID } from "@getu/definitions"
import { loadEntitlements } from "../../billing/entitlements"
import { authed } from "../context"
import { requireModelAccess, type Plan } from "./models"
import { consumeTranslateQuota, requireCharLimit } from "./quota"

const { textTranslations } = schema

const FREE_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function resolvePlan(tier: string | undefined): Plan {
  if (tier === "pro" || tier === "enterprise") return tier
  return "free"
}

/**
 * Web /translate text endpoint.
 *
 * M6.3 SKELETON: validates input, model access, quota; returns a stub
 * `text` payload. Real provider wiring (Google/Microsoft REST + LLM
 * streaming via ai-sdk) lands in M6.5.
 *
 * Quota: each *button click* counts as 1 against `web_text_translate_monthly`,
 * regardless of column count. The client should issue this procedure once
 * per click with the same `requestId` for every column to keep the
 * idempotent guarantee from `consumeQuota`.
 */
export const translateText = authed
  .input(translateTextInputSchema)
  .output(translateTextOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    const ent = await loadEntitlements(db, userId, context.env.BILLING_ENABLED === "true")
    const plan = resolvePlan(ent.tier)

    // 1. Per-plan input length cap.
    requireCharLimit(plan, input.text)

    // 2. Per-plan model access (free → google/microsoft only).
    const modelId = requireModelAccess(plan, input.modelId)

    // 3. Atomic quota check + decrement (button-click count).
    //    requestId is column-id-independent on purpose: caller passes the
    //    same id for every concurrent column → consumeQuota's idempotency
    //    de-dupes them down to one decrement per click.
    await consumeTranslateQuota(
      db,
      userId,
      "web_text_translate_monthly",
      1,
      `web-text:${userId}:${input.columnId}`,
    )

    // M6.3 stub — real call lands in M6.5.
    const model = TRANSLATE_MODEL_BY_ID[modelId]
    return {
      columnId: input.columnId,
      modelId,
      text: `[stub:${model.displayName}] ${input.text}`,
      tokens: model.kind === "llm" ? { input: 0, output: 0 } : null,
    }
  })

/**
 * Persist one translation row (called by client after all column streams
 * resolve). Free users' rows expire 30 days out; Pro/Enterprise = null.
 */
export const saveTextHistory = authed
  .input(saveHistoryInputSchema)
  .output(saveHistoryOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    const ent = await loadEntitlements(db, userId, context.env.BILLING_ENABLED === "true")
    const plan = resolvePlan(ent.tier)

    const id = crypto.randomUUID()
    const now = Date.now()
    const expiresAtMs = plan === "free" ? now + FREE_HISTORY_RETENTION_MS : null

    await db.insert(textTranslations).values({
      id,
      userId,
      sourceText: input.sourceText,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      results: JSON.stringify(input.results),
      createdAt: new Date(now),
      expiresAt: expiresAtMs == null ? null : new Date(expiresAtMs),
    })

    return {
      id,
      expiresAt: expiresAtMs == null ? null : new Date(expiresAtMs).toISOString(),
    }
  })

/** List recent history rows for the current user, newest first. */
export const listTextHistory = authed
  .input(listHistoryInputSchema)
  .output(listHistoryOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    const cursorMs = input.cursor ? Number.parseInt(input.cursor, 10) : Number.POSITIVE_INFINITY
    if (Number.isNaN(cursorMs)) {
      throw new ORPCError("BAD_REQUEST", { message: "cursor must be a unix-ms integer" })
    }

    const rows = await db
      .select()
      .from(textTranslations)
      .where(
        and(
          eq(textTranslations.userId, userId),
          lt(
            textTranslations.createdAt,
            cursorMs === Number.POSITIVE_INFINITY ? new Date(8.64e15) : new Date(cursorMs),
          ),
        ),
      )
      .orderBy(desc(textTranslations.createdAt))
      .limit(input.limit + 1)
      .all()

    const items = rows.slice(0, input.limit).map((row) => {
      let results: Record<string, { text: string } | { error: string }> = {}
      try {
        const parsed = JSON.parse(row.results) as unknown
        if (parsed && typeof parsed === "object") {
          results = parsed as typeof results
        }
      } catch {
        // Treat corrupt rows as empty rather than failing the whole list.
      }
      const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as number)
      return {
        id: row.id,
        sourceText: row.sourceText,
        sourceLang: row.sourceLang,
        targetLang: row.targetLang,
        results,
        createdAt: createdAt.toISOString(),
      }
    })

    const last = rows[input.limit]
    const nextCursor = last
      ? String((last.createdAt instanceof Date ? last.createdAt : new Date(last.createdAt as number)).getTime())
      : undefined

    return { items, nextCursor }
  })

export const textRouter = {
  translate: translateText,
  saveHistory: saveTextHistory,
  listHistory: listTextHistory,
}
