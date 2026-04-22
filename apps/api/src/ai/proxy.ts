import { isProModel, normalizeTokens, type ProModel } from "@getu/contract"
import { createDb } from "@getu/db"
import { consumeQuota } from "../billing/quota"
import { verifyAiJwt } from "./jwt"
import { extractUsageFromSSE } from "./usage-parser"
import type { WorkerEnv } from "../env"

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
  try {
    const v = await verifyAiJwt(bearer, env.AI_JWT_SECRET)
    userId = v.userId
  } catch {
    return json({ error: "invalid or expired token" }, 401)
  }

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
    ctx.waitUntil(chargeAfterStream(env, userId, model, usageP, requestId))
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
  ctx.waitUntil(chargeAfterStream(env, userId, model, Promise.resolve(usage), requestId))
  return new Response(text, {
    status: 200,
    headers: filterResponseHeaders(upstream.headers),
  })
}

async function chargeAfterStream(
  env: WorkerEnv,
  userId: string,
  model: ProModel,
  usageP: Promise<{ input: number; output: number } | null>,
  requestId: string,
): Promise<void> {
  try {
    const usage = await usageP
    const units = usage == null ? 1 : normalizeTokens(model, usage)
    if (units < 1) return
    const db = createDb(env.DB)
    await consumeQuota(db, userId, "ai_translate_monthly", units, requestId)
    // NOTE: consumeQuota does not currently write upstream_model / input_tokens / output_tokens.
    // Those columns stay null in Phase 3 — deferred as future analytics enhancement.
  } catch (err) {
    console.warn("[ai-proxy] charge failed", { userId, model, requestId, err: String(err) })
  }
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
