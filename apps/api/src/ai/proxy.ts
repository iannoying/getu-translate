import { isProModel, normalizeTokens, type ProModel } from "@getu/contract"
import { createDb } from "@getu/db"
import {
  normalizeTranslateTokens,
  type TranslateModelId,
} from "@getu/definitions"
import { assertCanConsumeQuotaBucket, consumeQuota } from "../billing/quota"
import { isAiProxyQuotaBucket, verifyAiJwt, type AiProxyQuotaBucket } from "./jwt"
import { checkRateLimit, RATE_LIMIT_PER_MINUTE } from "./rate-limit"
import { extractUsageFromSSE } from "./usage-parser"
import type { WorkerEnv } from "../env"
import { logger } from "../analytics/logger"

const PRO_MODEL_TO_TRANSLATE_MODEL_ID = {
  "deepseek-v4-pro": "deepseek-v4-pro",
  "qwen3.5-plus": "qwen-3.5-plus",
  "glm-5.1": "glm-5.1",
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
  "gpt-5.5": "gpt-5.5",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
} as const satisfies Record<ProModel, TranslateModelId>

function resolveAiProxyQuotaBucket(req: Request): AiProxyQuotaBucket {
  const raw = req.headers.get("x-getu-quota-bucket")
  if (raw === null || raw === "" || raw === "ai_translate_monthly") {
    return "ai_translate_monthly"
  }
  if (isAiProxyQuotaBucket(raw)) {
    return raw
  }
  return "ai_translate_monthly"
}

export async function handleChatCompletions(
  req: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  // 1. Auth
  const authHeader = req.headers.get("authorization") ?? ""
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!bearer) return json({ error: "missing bearer token" }, 401)
  let userId: string
  let authorizedQuotaBucket: AiProxyQuotaBucket
  try {
    const v = await verifyAiJwt(bearer, env.AI_JWT_SECRET)
    userId = v.userId
    authorizedQuotaBucket = v.quotaBucket
  } catch {
    return json({ error: "invalid or expired token" }, 401)
  }

  // Rate limit check — costs 1 small D1 read + 1 write per request
  const db = createDb(env.DB)
  const allowed = await checkRateLimit(db, userId)
  if (!allowed) return json({ error: `rate limit exceeded: ${RATE_LIMIT_PER_MINUTE} req/min` }, 429)

  // 2. Parse + validate model
  const body = (await req.json().catch(() => null)) as {
    model?: unknown
    messages?: unknown
    stream?: unknown
    stream_options?: unknown
  } | null
  if (!body || typeof body.model !== "string") return json({ error: "missing model" }, 400)
  if (!isProModel(body.model))
    return json({ error: `model '${body.model}' not in Pro whitelist` }, 400)
  const model: ProModel = body.model
  const quotaBucket = resolveAiProxyQuotaBucket(req)
  if (quotaBucket !== authorizedQuotaBucket) {
    return json({
      error: `quota bucket '${quotaBucket}' is not authorized by this token`,
      code: "FORBIDDEN",
    }, 403)
  }

  try {
    await assertCanConsumeQuotaBucket(db, userId, quotaBucket)
  } catch (err) {
    const quotaError = quotaErrorResponse(err)
    if (quotaError) return quotaError
    logger.warn("[ai-proxy] quota preflight failed", {
      userId,
      quotaBucket,
      err: String(err),
    }, { env, executionCtx: ctx })
    return json({ error: "quota preflight failed" }, 500)
  }

  // 3. Forward to bianxie.ai — force stream_options.include_usage so we can charge
  // Note: client's own stream_options is intentionally overwritten to guarantee
  // usage data is always present in the upstream response for quota accounting.
  const upstream = await fetch(`${env.BIANXIE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.BIANXIE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, stream_options: { include_usage: true } }),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "")
    return json({ error: "upstream error", status: upstream.status, body: text }, 502)
  }

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()

  // 4. Stream branch
  const isStream =
    body.stream === true ||
    (upstream.headers.get("content-type") ?? "").includes("text/event-stream")
  if (isStream) {
    const [forward, usageP] = extractUsageFromSSE(upstream.body)
    if (quotaBucket === "web_text_translate_token_monthly") {
      try {
        await chargeQuota(db, userId, model, usageP, requestId, quotaBucket)
      } catch (err) {
        const quotaError = quotaErrorResponse(err)
        if (quotaError) return quotaError
        logger.warn("[ai-proxy] charge failed", {
          userId,
          model,
          requestId,
          quotaBucket,
          err: String(err),
        }, { env, executionCtx: ctx })
        return json({ error: "quota charge failed" }, 500)
      }
    } else {
      ctx.waitUntil(chargeAfterStream(db, userId, model, usageP, requestId, quotaBucket, env))
    }
    return new Response(forward, {
      status: 200,
      headers: filterResponseHeaders(upstream.headers),
    })
  }

  // 5. Non-streaming branch
  const text = await upstream.text()
  let parsed: { usage?: { prompt_tokens?: number; completion_tokens?: number } } = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    /* ignore */
  }
  const usage =
    parsed.usage?.prompt_tokens != null && parsed.usage?.completion_tokens != null
      ? { input: parsed.usage.prompt_tokens, output: parsed.usage.completion_tokens }
      : null
  if (quotaBucket === "web_text_translate_token_monthly") {
    try {
      await chargeQuota(db, userId, model, Promise.resolve(usage), requestId, quotaBucket)
    } catch (err) {
      const quotaError = quotaErrorResponse(err)
      if (quotaError) return quotaError
      logger.warn("[ai-proxy] charge failed", {
        userId,
        model,
        requestId,
        quotaBucket,
        err: String(err),
      }, { env, executionCtx: ctx })
      return json({ error: "quota charge failed" }, 500)
    }
  } else {
    ctx.waitUntil(chargeAfterStream(db, userId, model, Promise.resolve(usage), requestId, quotaBucket, env))
  }
  return new Response(text, {
    status: 200,
    headers: filterResponseHeaders(upstream.headers),
  })
}

async function chargeAfterStream(
  db: ReturnType<typeof createDb>,
  userId: string,
  model: ProModel,
  usageP: Promise<{ input: number; output: number } | null>,
  requestId: string,
  quotaBucket: AiProxyQuotaBucket,
  env: WorkerEnv,
): Promise<void> {
  try {
    await chargeQuota(db, userId, model, usageP, requestId, quotaBucket)
  } catch (err) {
    logger.warn("[ai-proxy] charge failed", {
      userId,
      model,
      requestId,
      quotaBucket,
      err: String(err),
    }, { env })
  }
}

async function chargeQuota(
  db: ReturnType<typeof createDb>,
  userId: string,
  model: ProModel,
  usageP: Promise<{ input: number; output: number } | null>,
  requestId: string,
  quotaBucket: AiProxyQuotaBucket,
): Promise<void> {
  const usage = await usageP
  const units = usage == null ? 1 : normalizeQuotaTokens(quotaBucket, model, usage)
  if (units < 1) return
  await consumeQuota(
    db, userId, quotaBucket, units, requestId,
    undefined,
    model,
    usage?.input,
    usage?.output,
  )
}

function normalizeQuotaTokens(
  quotaBucket: AiProxyQuotaBucket,
  model: ProModel,
  usage: { input: number; output: number },
): number {
  if (quotaBucket === "web_text_translate_token_monthly") {
    return normalizeTranslateTokens(PRO_MODEL_TO_TRANSLATE_MODEL_ID[model], usage)
  }
  return normalizeTokens(model, usage)
}

function hasErrorCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

function quotaErrorResponse(err: unknown): Response | null {
  if (hasErrorCode(err, "FORBIDDEN")) {
    return json({ error: getErrorMessage(err, "quota bucket forbidden"), code: "FORBIDDEN" }, 403)
  }
  if (hasErrorCode(err, "QUOTA_EXCEEDED")) {
    return json({ error: getErrorMessage(err, "quota exceeded"), code: "QUOTA_EXCEEDED" }, 429)
  }
  return null
}

function filterResponseHeaders(h: Headers): HeadersInit {
  // Forward content-type and cache-control only; drop transfer-encoding: chunked
  // and other upstream-specific headers that break CF Workers.
  const out: Record<string, string> = {}
  const ct = h.get("content-type")
  if (ct) out["content-type"] = ct
  const cc = h.get("cache-control")
  if (cc) out["cache-control"] = cc
  return out
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}
