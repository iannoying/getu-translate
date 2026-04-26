import { ORPCError } from "@orpc/server"
import { and, desc, eq, lt } from "drizzle-orm"
import { createDb } from "@getu/db"
import { schema } from "@getu/db"
import {
  clearHistoryInputSchema,
  clearHistoryOutputSchema,
  deleteHistoryInputSchema,
  deleteHistoryOutputSchema,
  historyResultsSchema,
  listHistoryInputSchema,
  listHistoryOutputSchema,
  saveHistoryInputSchema,
  saveHistoryOutputSchema,
  translateTextInputSchema,
  translateTextOutputSchema,
} from "@getu/contract"
import { TRANSLATE_MODEL_BY_ID, type TranslateModelId } from "@getu/definitions"
import { loadEntitlements } from "../../billing/entitlements"
import {
  TranslateProviderError,
  googleTranslate,
  microsoftTranslate,
} from "../../translate/free-providers"
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
 * Translate one column. M6.5a behavior:
 *
 *   - `google` / `microsoft`  → real HTTP call to the corresponding free
 *     public translator. Failures are wrapped as INTERNAL_SERVER_ERROR with
 *     `data.code = 'PROVIDER_FAILED'` so the client can render the per-card
 *     error state without affecting the other 10 columns.
 *   - 9 LLM models  → still a stub (waiting on bianxie.ai routing config +
 *     API keys for the new model ids in M6.5b). The stub pretends to spend
 *     a small, deterministic amount of input/output tokens so the Pro
 *     token-quota wiring is testable end-to-end.
 *
 * Quota: each *button click* counts as 1 against `web_text_translate_monthly`,
 * regardless of column count. The client passes the same `clickId` UUID to
 * every concurrent column; `consumeQuota`'s (userId, requestId) idempotency
 * collapses them to one decrement.
 */
async function dispatchTranslate(
  modelId: TranslateModelId,
  text: string,
  source: string,
  target: string,
): Promise<{ text: string; tokens: { input: number; output: number } | null }> {
  if (modelId === "google") {
    return { text: await googleTranslate(text, source, target), tokens: null }
  }
  if (modelId === "microsoft") {
    return { text: await microsoftTranslate(text, source, target), tokens: null }
  }
  // LLM stub — see M6.5b TODO above. Token mock = 1.5x char count rounded
  // up so Pro token-quota math has non-zero values to exercise.
  const inputTokens = Math.ceil(text.length / 4)
  const outputTokens = Math.ceil(text.length / 3)
  const display = TRANSLATE_MODEL_BY_ID[modelId].displayName
  return {
    text: `[Pro stub: ${display} 将在 M6.5b 接通] ${text}`,
    tokens: { input: inputTokens, output: outputTokens },
  }
}

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

    // 3. Atomic quota check + decrement (button-click count). All concurrent
    //    column calls from the same click share `clickId`, so consumeQuota's
    //    idempotency collapses them to one decrement.
    await consumeTranslateQuota(
      db,
      userId,
      "web_text_translate_monthly",
      1,
      `web-text:${userId}:${input.clickId}`,
    )

    // 4. Dispatch to the right provider. Provider failures are wrapped so
    //    the per-card error UI surfaces a friendly message; we deliberately
    //    don't refund quota on provider failure (consumeQuota already ran
    //    and other columns may have succeeded — refund logic is a per-click
    //    aggregate decision, not per-column).
    try {
      const result = await dispatchTranslate(modelId, input.text, input.sourceLang, input.targetLang)
      return {
        columnId: input.columnId,
        modelId,
        text: result.text,
        tokens: result.tokens,
      }
    } catch (err) {
      if (err instanceof TranslateProviderError) {
        console.error("[translate.providerFailed]", {
          provider: err.providerId,
          statusCode: err.statusCode,
          message: err.message,
        })
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err.message,
          data: {
            code: "PROVIDER_FAILED",
            providerId: err.providerId,
            modelId,
            columnId: input.columnId,
          },
        })
      }
      throw err
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
      // Defense-in-depth (#191): the DB has no `CHECK (json_valid(results))`
      // constraint (deferred — see packages/db/AGENTS.md for SQLite CHECK
      // migration cost rationale). Use the contract's Zod schema to validate
      // the parsed JSON shape per row. Any row that fails parse OR shape is
      // surfaced to the client as empty results, not as a 500 — better UX,
      // and the row itself remains in the DB for ops to inspect/clean up.
      let results: Record<string, { text: string } | { error: string }> = {}
      try {
        const parsed = JSON.parse(row.results) as unknown
        const validated = historyResultsSchema.safeParse(parsed)
        if (validated.success) {
          results = validated.data as typeof results
        }
      } catch {
        // JSON.parse threw — corrupt row. Drop to empty-results fallback.
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

/**
 * Delete a single history row owned by the current user. Returns
 * `{ deleted: true }` even if the row didn't exist (idempotent — caller
 * shouldn't have to distinguish "already gone" from "never existed").
 *
 * Security: the WHERE clause includes `user_id = currentUser`, so a user
 * passing another user's row id silently no-ops rather than leaks data.
 */
export const deleteTextHistory = authed
  .input(deleteHistoryInputSchema)
  .output(deleteHistoryOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    await db
      .delete(textTranslations)
      .where(and(eq(textTranslations.id, input.id), eq(textTranslations.userId, userId)))
      .run()

    // We do not fetch row-affected from D1 prepared writes (extra round trip
    // for negligible client value); a missing row simply yields no-op.
    return { deleted: true }
  })

/** Wipe every history row for the current user. Returns the row count. */
export const clearTextHistory = authed
  .input(clearHistoryInputSchema)
  .output(clearHistoryOutputSchema)
  .handler(async ({ context }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id

    // Count first so the client can show "Cleared N entries" feedback. The
    // 2-statement pattern is acceptable here because (a) clearing is rare,
    // (b) D1 has no atomic SELECT-COUNT-then-DELETE in a single round trip,
    // and (c) a small race (concurrent insert between count and delete) is
    // self-resolving — the count under-reports by at most a handful.
    const rows = await db
      .select({ id: textTranslations.id })
      .from(textTranslations)
      .where(eq(textTranslations.userId, userId))
      .all()

    await db.delete(textTranslations).where(eq(textTranslations.userId, userId)).run()

    return { deletedCount: rows.length }
  })

export const textRouter = {
  translate: translateText,
  saveHistory: saveTextHistory,
  listHistory: listTextHistory,
  deleteHistory: deleteTextHistory,
  clearHistory: clearTextHistory,
}
