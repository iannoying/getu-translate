import { Hono } from "hono"
import { z } from "zod"
import { AwsClient } from "aws4fetch"
import { PDFDocument } from "pdf-lib"
import { and, eq, inArray } from "drizzle-orm"
import { createDb, schema } from "@getu/db"
import {
  TRANSLATE_DOCUMENT_MAX_BYTES,
  TRANSLATE_DOCUMENT_MAX_PAGES,
} from "@getu/contract"
import { createAuth } from "../auth"
import type { WorkerEnv } from "../env"
import { loadEntitlements } from "../billing/entitlements"
import { consumeTranslateQuota } from "../orpc/translate/quota"
import { requireModelAccess, type Plan } from "../orpc/translate/models"
import { logger } from "../analytics/logger"

/**
 * Hono routes for the M6.8 PDF upload pipeline.
 *
 *   POST /api/translate/document/presign
 *     Issue an R2 S3-style presigned PUT URL the browser can directly
 *     upload to. Used by the manual /document upload UI. The endpoint
 *     never touches PDF bytes — it only allocates `pdfs/{userId}/{jobUuid}/source.pdf`
 *     and signs a 5-minute window. Job creation happens via the
 *     `translate.document.create` oRPC procedure after the PUT succeeds.
 *
 *   POST /api/translate/document/from-url
 *     Accept a third-party PDF URL (extension's `?src=` redirect, PR #181),
 *     SSRF-guard it, stream into R2 with the same byte cap, then run the
 *     same metadata + quota + INSERT + enqueue path as `documentCreate`.
 *     This avoids client-side CORS pain on arxiv-like hosts.
 *
 * Both routes require an authenticated session. Anonymous calls return 401.
 *
 * These are Hono (not oRPC) routes because they return a non-typed payload
 * (presign URL) or have streaming/SSRF behavior that doesn't fit oRPC's
 * request-response Zod contract well.
 */

const { translationJobs } = schema

const PRESIGN_EXPIRES_SECONDS = 300
const FREE_PDF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const PRO_PDF_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

const presignBody = z
  .object({
    filename: z.string().min(1).max(512),
    contentLength: z.number().int().min(1).max(TRANSLATE_DOCUMENT_MAX_BYTES),
  })
  .strict()

const fromUrlBody = z
  .object({
    src: z.string().url().max(2048),
    modelId: z.string().min(1).max(64),
    sourceLang: z.string().min(2).max(16),
    targetLang: z.string().min(2).max(16),
  })
  .strict()

function resolvePlan(tier: string | undefined): Plan {
  if (tier === "pro" || tier === "enterprise") return tier
  return "free"
}

/**
 * Reject hostnames that resolve (or look like they resolve) to private,
 * loopback, link-local, or otherwise SSRF-sensitive ranges.
 *
 * We intentionally do this on the URL string only — Workers have no DNS
 * resolution API, so we can't catch DNS-rebinding tricks where a public
 * name resolves to a private IP at fetch time. The mitigation against
 * that is the `redirect: "manual"` policy below + the content-type check:
 * even if a malicious resolver hands us 169.254.169.254, the response
 * won't be a PDF and we'll reject it. We also rely on Cloudflare's outbound
 * fetch policy (egress over CF's network) which already blocks RFC1918.
 */
export function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase()
  if (!h) return true
  if (h === "localhost") return true
  if (h.endsWith(".localhost")) return true
  if (h.endsWith(".internal")) return true
  if (h.endsWith(".local")) return true
  // IPv4 literal
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    if (a === 0) return true
    if (a === 127) return true
    if (a === 10) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 169 && b === 254) return true
    return false
  }
  // IPv6 literal — Workers exposes URL.hostname unbracketed for v6
  if (h === "::1" || h === "::") return true
  // IPv4-mapped IPv6 (::ffff:<ipv4>) — recurse the embedded IPv4 so all
  // private ranges are caught the same way as plain IPv4 literals.
  if (h.startsWith("::ffff:")) {
    return isPrivateHostname(h.slice("::ffff:".length))
  }
  if (h.startsWith("fe80")) return true // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true // unique-local
  return false
}

/**
 * Heuristic: does this URL + content-type look like a PDF?
 *   - Path ends with `.pdf` (case-insensitive)
 *   - Content-Type contains `application/pdf`
 *   - Content-Type contains `application/octet-stream` AND path ends `.pdf`
 *   - Known endpoints (arxiv `/pdf/<id>`, openreview `/pdf?id=...`)
 */
export function looksLikePdf(url: URL, contentType: string): boolean {
  const ct = contentType.toLowerCase()
  const pathLower = url.pathname.toLowerCase()
  const pathEndsPdf = pathLower.endsWith(".pdf")
  if (ct.includes("application/pdf")) return true
  if (ct.includes("octet-stream") && pathEndsPdf) return true
  if (pathEndsPdf) return true
  if (url.hostname === "arxiv.org" && pathLower.startsWith("/pdf/")) return true
  if (url.hostname === "openreview.net" && pathLower === "/pdf") return true
  return false
}

/**
 * Build the AwsClient for R2 S3-compatible signing. Returns null when the
 * required secrets aren't bound (dev / test fallback) — caller should 503.
 */
export function tryBuildR2Signer(env: WorkerEnv): { client: AwsClient; endpoint: string; bucket: string } | null {
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const bucket = env.R2_BUCKET_PDFS_NAME
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" })
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`
  return { client, endpoint, bucket }
}

function getExecutionCtx(c: { executionCtx: ExecutionContext }): ExecutionContext | undefined {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}

/**
 * Sign a PUT URL for the given key, expiring in 5 minutes. The URL embeds
 * the auth via query string so the browser can `fetch(url, { method: "PUT", body })`
 * without crafting Authorization headers (CORS-friendly).
 *
 * contentLength and contentType are included as signed headers so R2 rejects
 * any PUT that doesn't match — prevents a client from uploading a larger blob
 * than was declared at presign time.
 */
export async function presignPut(
  signer: { client: AwsClient; endpoint: string; bucket: string },
  sourceKey: string,
  contentLength: number,
  contentType = "application/pdf",
): Promise<string> {
  const url = new URL(`${signer.endpoint}/${signer.bucket}/${sourceKey}`)
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_EXPIRES_SECONDS))
  const signed = await signer.client.sign(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Length": String(contentLength),
      "Content-Type": contentType,
    },
    // allHeaders: true forces aws4fetch to include content-length and content-type
    // in X-Amz-SignedHeaders (they are in its UNSIGNABLE_HEADERS list by default).
    // R2 will then reject any PUT whose headers don't match the signature.
    aws: { signQuery: true, service: "s3", allHeaders: true },
  })
  return signed.url
}

/**
 * Read a PDF's page count via pdf-lib (pure JS, no canvas dep — works in
 * Workers). Throws SCANNED_PDF if pdf-lib can't parse it (encrypted /
 * malformed / scanned-only PDFs).
 *
 * Note: pdf-lib parses the PDF cross-reference table, so it's O(file size)
 * memory but doesn't load every page glyph stream. 50MB upper bound is
 * acceptable for a Worker (CPU time > size).
 */
export async function readPdfPageCount(bytes: Uint8Array | ArrayBuffer): Promise<number> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: false })
  } catch {
    const error = new Error("SCANNED_PDF") as Error & { code: string }
    error.code = "SCANNED_PDF"
    throw error
  }
  const pages = doc.getPageCount()
  if (!pages || pages < 1) {
    const error = new Error("SCANNED_PDF") as Error & { code: string }
    error.code = "SCANNED_PDF"
    throw error
  }
  return pages
}

/**
 * Stream-fetch a remote PDF, enforcing:
 *   - protocol must be http/https
 *   - hostname not private (SSRF)
 *   - no auto-follow redirects (SSRF rebinding)
 *   - content-type / extension matches PDF
 *   - response body ≤ 50MB (cap mid-stream, not after)
 *
 * Returns the bytes + final content-type.
 */
export async function fetchPdfFromUrl(
  src: string,
  maxBytes: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string; finalUrl: URL }> {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    throw new HttpError(400, "INVALID_URL", "无法解析的 URL")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError(400, "INVALID_PROTOCOL", "仅支持 http/https URL")
  }
  if (isPrivateHostname(url.hostname)) {
    throw new HttpError(400, "PRIVATE_HOST", "拒绝抓取私有/内网地址")
  }
  let res: Response
  try {
    res = await fetchImpl(url.toString(), { redirect: "manual" })
  } catch (err) {
    throw new HttpError(502, "FETCH_FAILED", `抓取失败：${(err as Error).message}`)
  }
  if (res.status >= 300 && res.status < 400) {
    throw new HttpError(400, "REDIRECT_BLOCKED", "拒绝跟随重定向（SSRF 防护）")
  }
  if (!res.ok) {
    throw new HttpError(res.status, "UPSTREAM_ERROR", `源站返回 ${res.status}`)
  }
  const ct = res.headers.get("content-type") ?? "application/octet-stream"
  if (!looksLikePdf(url, ct)) {
    throw new HttpError(415, "NOT_PDF", `源站返回的不是 PDF（content-type=${ct}）`)
  }
  const declared = res.headers.get("content-length")
  if (declared && Number(declared) > maxBytes) {
    throw new HttpError(413, "TOO_LARGE", `PDF 大于 ${Math.floor(maxBytes / 1024 / 1024)} MB 上限`)
  }
  if (!res.body) {
    throw new HttpError(502, "EMPTY_BODY", "源站响应为空")
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      try { await reader.cancel() } catch { /* noop */ }
      throw new HttpError(413, "TOO_LARGE", `PDF 大于 ${Math.floor(maxBytes / 1024 / 1024)} MB 上限`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  return { bytes, contentType: ct, finalUrl: url }
}

class HttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
    this.code = code
  }
}

export const documentRoutes = new Hono<{ Bindings: WorkerEnv }>()

/**
 * Resolve the session for a Hono request. Returns null on anonymous —
 * caller renders 401. We re-create the auth client per request rather
 * than holding it in module scope because it depends on env which is
 * per-deployment.
 */
async function getSession(env: WorkerEnv, req: Request) {
  const auth = createAuth(env)
  return auth.api.getSession({ headers: req.headers }).catch(() => null)
}

documentRoutes.post("/presign", async (c) => {
  const session = await getSession(c.env, c.req.raw)
  if (!session?.user) return c.json({ error: "unauthorized" }, 401)

  let body: z.infer<typeof presignBody>
  try {
    body = presignBody.parse(await c.req.json())
  } catch (err) {
    return c.json({ error: "bad_request", details: (err as Error).message }, 400)
  }

  const signer = tryBuildR2Signer(c.env)
  if (!signer) {
    return c.json(
      {
        error: "r2_unavailable",
        message: "R2 上传未配置（dev fallback）。请联系管理员开启或在 wrangler 上配置 R2_* 凭据。",
      },
      503,
    )
  }

  const jobUuid = crypto.randomUUID()
  const sourceKey = `pdfs/${session.user.id}/${jobUuid}/source.pdf`
  const uploadUrl = await presignPut(signer, sourceKey, body.contentLength)
  return c.json({ uploadUrl, sourceKey, expiresInSeconds: PRESIGN_EXPIRES_SECONDS })
})

documentRoutes.post("/from-url", async (c) => {
  const session = await getSession(c.env, c.req.raw)
  if (!session?.user) return c.json({ error: "unauthorized" }, 401)
  const userId = session.user.id

  let body: z.infer<typeof fromUrlBody>
  try {
    body = fromUrlBody.parse(await c.req.json())
  } catch (err) {
    return c.json({ error: "bad_request", details: (err as Error).message }, 400)
  }

  const db = createDb(c.env.DB)
  const ent = await loadEntitlements(db, userId, c.env.BILLING_ENABLED === "true")
  const plan = resolvePlan(ent.tier)
  let modelId: string
  try {
    modelId = requireModelAccess(plan, body.modelId)
  } catch (err) {
    const data = (err as { data?: { code?: string } })?.data
    return c.json({ error: data?.code ?? "model_forbidden", message: (err as Error).message }, 403)
  }

  // Concurrency: one PDF per user.
  const active = await db
    .select({ id: translationJobs.id })
    .from(translationJobs)
    .where(
      and(
        eq(translationJobs.userId, userId),
        inArray(translationJobs.status, ["queued", "processing"]),
      ),
    )
    .limit(1)
    .all()
  if (active.length > 0) {
    return c.json(
      { error: "PDF_JOB_INFLIGHT", existingJobId: active[0].id, message: "已有 PDF 翻译任务正在进行" },
      409,
    )
  }

  // Fetch the upstream PDF with SSRF guards.
  let fetched: { bytes: Uint8Array; contentType: string; finalUrl: URL }
  try {
    fetched = await fetchPdfFromUrl(body.src, TRANSLATE_DOCUMENT_MAX_BYTES)
  } catch (err) {
    if (err instanceof HttpError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400 | 413 | 415 | 502)
    }
    return c.json({ error: "fetch_failed", message: (err as Error).message }, 502)
  }

  // Server-side page count — never trust the client here, the URL itself
  // is the only input.
  let pages: number
  try {
    pages = await readPdfPageCount(fetched.bytes)
  } catch (err) {
    const code = (err as { code?: string }).code ?? "SCANNED_PDF"
    return c.json({ error: code, message: "无法读取 PDF 页数（可能是扫描件或加密文件）" }, 422)
  }
  if (pages > TRANSLATE_DOCUMENT_MAX_PAGES) {
    return c.json(
      { error: "TOO_MANY_PAGES", limit: TRANSLATE_DOCUMENT_MAX_PAGES, actual: pages, message: "PDF 页数超出上限" },
      413,
    )
  }

  const jobId = crypto.randomUUID()
  const sourceKey = `pdfs/${userId}/${jobId}/source.pdf`

  // Upload bytes to R2 (skip when binding missing — dev fallback).
  if (c.env.BUCKET_PDFS) {
    await c.env.BUCKET_PDFS.put(sourceKey, fetched.bytes, {
      httpMetadata: { contentType: "application/pdf" },
    })
  } else {
    logger.warn(
      "[document/from-url] BUCKET_PDFS missing — skipping R2 upload (dev)",
      {},
      { env: c.env, executionCtx: getExecutionCtx(c) },
    )
  }

  const now = Date.now()
  const expiresAtMs = now + (plan === "free" ? FREE_PDF_RETENTION_MS : PRO_PDF_RETENTION_MS)
  const filename = decodeURIComponent(fetched.finalUrl.pathname.split("/").pop() || "remote.pdf").slice(0, 512)

  // INSERT first — UNIQUE partial index is the authoritative race winner.
  // Both legs of a double-fire pass the SELECT check above, but only one
  // INSERT wins; the loser gets a clean 409 without consuming any quota.
  try {
    await db.insert(translationJobs).values({
      id: jobId,
      userId,
      sourceKey,
      sourcePages: pages,
      sourceFilename: filename,
      sourceBytes: fetched.bytes.byteLength,
      modelId,
      sourceLang: body.sourceLang,
      targetLang: body.targetLang,
      status: "queued",
      engine: "simple",
      createdAt: new Date(now),
      expiresAt: new Date(expiresAtMs),
    })
  } catch (err) {
    const msg = (err as { message?: string }).message ?? ""
    if (msg.includes("UNIQUE constraint failed: translation_jobs.user_id")) {
      return c.json({ error: "PDF_JOB_INFLIGHT" }, 409)
    }
    throw err
  }

  // Only the INSERT winner reaches here. Consume quota now.
  // On quota exhaustion, roll back the INSERT so the user isn't stuck with
  // a phantom in-flight row blocking their next attempt.
  try {
    await consumeTranslateQuota(
      db,
      userId,
      "web_pdf_translate_monthly",
      pages,
      `web-pdf:${userId}:${jobId}`,
    )
  } catch (err) {
    // Best-effort rollback: if DELETE fails, log and still re-throw the
    // quota error. The retention worker will eventually clean the orphan.
    try {
      await db.delete(translationJobs)
        .where(and(eq(translationJobs.id, jobId), eq(translationJobs.userId, userId)))
        .run()
    } catch (delErr) {
      logger.warn(
        "[document/from-url] failed to rollback job row after quota failure",
        { err: delErr },
        { env: c.env, executionCtx: getExecutionCtx(c) },
      )
    }
    const data = (err as { data?: { code?: string } })?.data
    if (data?.code === "INSUFFICIENT_QUOTA") {
      return c.json({ error: "INSUFFICIENT_QUOTA", message: (err as Error).message }, 402)
    }
    throw err
  }

  // Best-effort enqueue: queue binding may be absent in dev.
  if (c.env.TRANSLATE_QUEUE) {
    await c.env.TRANSLATE_QUEUE.send({ jobId })
  } else {
    logger.warn(
      "[document/from-url] TRANSLATE_QUEUE missing — job will not auto-start",
      {},
      { env: c.env, executionCtx: getExecutionCtx(c) },
    )
  }

  return c.json({ jobId, sourcePages: pages })
})
