# PDF Standard Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/[locale]/document/preview` standard PDF reader with PDF.js source rendering, page-grouped translated text, and explicit retranslation from the result toolbar.

**Architecture:** Keep the current Cloudflare Worker document translation pipeline and add typed preview/retranslate APIs on top. Store every job's generated assets under that job id so retranslations from the same source PDF cannot overwrite earlier outputs. Replace the iframe preview with a client-side reader that fetches signed source PDF and segments URLs, renders the source with PDF.js, and renders translated segments grouped by page.

**Tech Stack:** Next.js 15 static export, React 19, pdfjs-dist, oRPC, Hono/Cloudflare Workers, R2 signed URLs via aws4fetch, D1/Drizzle, Vitest.

---

## Scope References

- Approved spec: `docs/specs/2026-05-09-pdf-standard-reader-design.md`
- Web document page: `apps/web/app/[locale]/document/document-client.tsx`
- Current preview page: `apps/web/app/[locale]/document/preview/preview-client.tsx`
- API document routes: `apps/api/src/orpc/translate/document.ts`
- Queue consumer: `apps/api/src/queue/translate-document.ts`
- Contract: `packages/contract/src/translate.ts`

## File Structure

Create:

- `apps/web/app/[locale]/document/preview/segments.ts`
  - Pure helpers for validating and grouping `segments.json` by page.
- `apps/web/app/[locale]/document/preview/pdf-dual-reader.tsx`
  - Reader shell, toolbar state, retranslate controls, and pane composition.
- `apps/web/app/[locale]/document/preview/pdf-source-pane.tsx`
  - PDF.js integration and page rendering.
- `apps/web/app/[locale]/document/preview/translation-pane.tsx`
  - Page-grouped translated text display.
- `apps/web/app/[locale]/document/preview/pdf-outline-sidebar.tsx`
  - Outline/page-list sidebar.
- `apps/web/app/[locale]/document/preview/__tests__/segments.test.ts`
  - Unit tests for segment parsing and grouping.
- `apps/api/src/translate/document-keys.ts`
  - Output-key derivation helpers shared by queue, retry/retranslate, and cleanup.
- `apps/api/src/translate/__tests__/document-keys.test.ts`
  - Unit tests for source/output key derivation.

Modify:

- `packages/contract/src/translate.ts`
  - Add preview and retranslate schemas plus procedures.
- `apps/api/src/orpc/translate/document.ts`
  - Add `documentPreview`, `documentRetranslate`, shared signing helper, and route exports.
- `apps/api/src/orpc/__tests__/document-extras.test.ts`
  - Cover preview and retranslate authorization, signing, quota, enqueue, and missing assets.
- `apps/api/src/queue/translate-document.ts`
  - Use per-job output keys rather than deriving outputs from `sourceKey`.
- `apps/api/src/queue/__tests__/translate-document.test.ts`
  - Assert output keys are per processing job id even when source key belongs to another job.
- `apps/api/src/scheduled/translation-cleanup.ts`
  - Delete per-job output keys and source key without assuming one shared prefix.
- `apps/api/src/scheduled/__tests__/translation-cleanup.test.ts`
  - Cover retranslations with reused source PDFs.
- `apps/web/package.json`
  - Add `pdfjs-dist`.
- `pnpm-lock.yaml`
  - Updated by `pnpm install`.
- `apps/web/lib/i18n/messages.ts`
  - Add reader toolbar/error labels in en, zh-CN, zh-TW.
- `apps/web/app/[locale]/document/preview/preview-state.ts`
  - Keep polling state, but carry done metadata enough for reader loading.
- `apps/web/app/[locale]/document/preview/preview-client.tsx`
  - Replace iframe preview with `PdfDualReader`; add preview data loading and retranslate handler.
- `apps/web/app/[locale]/document/styles.css`
  - Add screenshot-style reader layout.

## Task 1: Contract Schemas For Preview And Retranslate

**Files:**

- Modify: `packages/contract/src/translate.ts`

- [ ] **Step 1: Add failing type-check target by editing contract references in place**

Add these schemas after `documentDownloadUrlOutputSchema` in `packages/contract/src/translate.ts`:

```ts
export const documentPreviewInputSchema = z.object({ jobId: z.string().min(1) }).strict()
export type DocumentPreviewInput = z.infer<typeof documentPreviewInputSchema>

export const documentPreviewOutputSchema = z
  .object({
    job: z
      .object({
        id: z.string().min(1),
        sourceFilename: z.string().nullable(),
        sourcePages: z.number().int().min(1),
        sourceBytes: z.number().int().nullable(),
        modelId: modelIdSchema,
        sourceLang: langCodeSchema,
        targetLang: langCodeSchema,
        status: z.literal("done"),
        engine: translationJobEngineSchema,
        createdAt: z.string().datetime(),
        expiresAt: z.string().datetime(),
      })
      .strict(),
    sourcePdfUrl: z.string().url(),
    segmentsJsonUrl: z.string().url(),
    htmlUrl: z.string().url().nullable(),
    mdUrl: z.string().url().nullable(),
    expiresAt: z.string().datetime(),
  })
  .strict()
export type DocumentPreviewOutput = z.infer<typeof documentPreviewOutputSchema>

export const documentRetranslateInputSchema = z
  .object({
    jobId: z.string().min(1),
    modelId: modelIdSchema,
    sourceLang: langCodeSchema,
    targetLang: langCodeSchema,
  })
  .strict()
export type DocumentRetranslateInput = z.infer<typeof documentRetranslateInputSchema>

export const documentRetranslateOutputSchema = z.object({ jobId: z.string().min(1) }).strict()
export type DocumentRetranslateOutput = z.infer<typeof documentRetranslateOutputSchema>
```

- [ ] **Step 2: Wire procedures into the contract router**

Replace the `document` router block at the bottom of `packages/contract/src/translate.ts` with:

```ts
  document: oc.router({
    create: oc.input(documentCreateInputSchema).output(documentCreateOutputSchema),
    status: oc.input(documentStatusInputSchema).output(documentStatusOutputSchema),
    list: oc.input(documentListInputSchema).output(documentListOutputSchema),
    downloadUrl: oc.input(documentDownloadUrlInputSchema).output(documentDownloadUrlOutputSchema),
    preview: oc.input(documentPreviewInputSchema).output(documentPreviewOutputSchema),
    retry: oc.input(documentRetryInputSchema).output(documentRetryOutputSchema),
    retranslate: oc.input(documentRetranslateInputSchema).output(documentRetranslateOutputSchema),
  }),
```

- [ ] **Step 3: Run contract type-check**

Run:

```bash
pnpm --filter @getu/contract type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/contract/src/translate.ts
git commit -m "feat(contract): add pdf preview retranslate contract"
```

## Task 2: Document Output Key Helpers

**Files:**

- Create: `apps/api/src/translate/document-keys.ts`
- Create: `apps/api/src/translate/__tests__/document-keys.test.ts`

- [ ] **Step 1: Write failing tests for key derivation**

Create `apps/api/src/translate/__tests__/document-keys.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  buildDocumentOutputKeys,
  buildSegmentsKey,
  getPdfJobBasePrefix,
} from "../document-keys"

describe("document key helpers", () => {
  it("builds a per-job base prefix", () => {
    expect(getPdfJobBasePrefix("u1", "job2")).toBe("pdfs/u1/job2")
  })

  it("builds per-job output keys from the processing job id", () => {
    expect(buildDocumentOutputKeys("u1", "job2")).toEqual({
      segmentsKey: "pdfs/u1/job2/segments.json",
      htmlKey: "pdfs/u1/job2/output.html",
      mdKey: "pdfs/u1/job2/output.md",
    })
  })

  it("keeps buildSegmentsKey available for cleanup call sites", () => {
    expect(buildSegmentsKey("u1", "job3")).toBe("pdfs/u1/job3/segments.json")
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @getu/api test -- src/translate/__tests__/document-keys.test.ts
```

Expected: FAIL because `../document-keys` does not exist.

- [ ] **Step 3: Implement key helpers**

Create `apps/api/src/translate/document-keys.ts`:

```ts
export function getPdfJobBasePrefix(userId: string, jobId: string): string {
  return `pdfs/${userId}/${jobId}`
}

export function buildSegmentsKey(userId: string, jobId: string): string {
  return `${getPdfJobBasePrefix(userId, jobId)}/segments.json`
}

export function buildDocumentOutputKeys(userId: string, jobId: string): {
  segmentsKey: string
  htmlKey: string
  mdKey: string
} {
  const base = getPdfJobBasePrefix(userId, jobId)
  return {
    segmentsKey: `${base}/segments.json`,
    htmlKey: `${base}/output.html`,
    mdKey: `${base}/output.md`,
  }
}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
pnpm --filter @getu/api test -- src/translate/__tests__/document-keys.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translate/document-keys.ts apps/api/src/translate/__tests__/document-keys.test.ts
git commit -m "feat(api): add pdf document key helpers"
```

## Task 3: Queue Uses Per-Job Output Keys

**Files:**

- Modify: `apps/api/src/queue/translate-document.ts`
- Modify: `apps/api/src/queue/__tests__/translate-document.test.ts`

- [ ] **Step 1: Add failing queue test for reused source key**

In `apps/api/src/queue/__tests__/translate-document.test.ts`, first extend the `setupJob` helper's `opts` type:

```ts
    sourceKey?: string
```

Then change the inserted job's `sourceKey` value from:

```ts
    sourceKey: `pdfs/${userId}/${jobId}/source.pdf`,
```

to:

```ts
    sourceKey: opts.sourceKey ?? `pdfs/${userId}/${jobId}/source.pdf`,
```

Then add this test near the successful processing tests:

```ts
it("writes outputs under the processing job id when source belongs to an older job", async () => {
  const sourceKey = "pdfs/u1/original-job/source.pdf"
  await setupJob(db, {
    jobId: "retranslated-job",
    userId: "u1",
    sourcePages: 1,
    sourceKey,
  })
  const pdfBuf = readFileSync(resolve(FIXTURE_DIR, "hello-world.pdf"))
  const pdfAb = pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength)

  const r2Get = vi.fn(async (key: string) =>
    key.endsWith("source.pdf")
      ? { arrayBuffer: async () => pdfAb }
      : null,
  )
  const r2Put = vi.fn(async () => undefined)

  const handler = createQueueHandler({
    db: db as unknown as Db,
    bucket: { get: r2Get, put: r2Put } as unknown as R2Bucket,
    env: {} as any,
    translateChunk: async () => "你好",
  })

  const { batch } = makeBatch("retranslated-job")
  await handler.queue(batch as any, {} as any, {} as any)

  const putKeys = r2Put.mock.calls.map((c) => (c as unknown[])[0] as string)
  expect(putKeys).toContain("pdfs/u1/retranslated-job/segments.json")
  expect(putKeys).toContain("pdfs/u1/retranslated-job/output.html")
  expect(putKeys).toContain("pdfs/u1/retranslated-job/output.md")
  expect(putKeys).not.toContain("pdfs/u1/original-job/output.html")
})
```

- [ ] **Step 2: Run focused queue test and verify it fails**

Run:

```bash
pnpm --filter @getu/api test -- src/queue/__tests__/translate-document.test.ts
```

Expected: FAIL because output keys are still derived from `sourceKey`.

- [ ] **Step 3: Use `buildDocumentOutputKeys` in the queue consumer**

Add this import to `apps/api/src/queue/translate-document.ts`:

```ts
import { buildDocumentOutputKeys } from "../translate/document-keys"
```

Replace the current segments/html/md key derivation in `processOne` with:

```ts
    const { segmentsKey, htmlKey, mdKey } = buildDocumentOutputKeys(job.userId, job.id)
```

The `bucket.put` calls should use those variables:

```ts
      await bucket.put(segmentsKey, JSON.stringify(segmentsFile), {
        httpMetadata: { contentType: "application/json" },
      })
```

```ts
      await bucket.put(htmlKey, html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
      })
      await bucket.put(mdKey, md, {
        httpMetadata: { contentType: "text/markdown; charset=utf-8" },
      })
```

Keep the DB update storing `outputHtmlKey: htmlKey` and `outputMdKey: mdKey`.

- [ ] **Step 4: Run queue tests**

Run:

```bash
pnpm --filter @getu/api test -- src/queue/__tests__/translate-document.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/queue/translate-document.ts apps/api/src/queue/__tests__/translate-document.test.ts
git commit -m "fix(api): store pdf outputs under processing job"
```

## Task 4: Preview And Retranslate API

**Files:**

- Modify: `apps/api/src/orpc/translate/document.ts`
- Modify: `apps/api/src/orpc/__tests__/document-extras.test.ts`

- [ ] **Step 1: Add failing preview API tests**

In `apps/api/src/orpc/__tests__/document-extras.test.ts`, extend `doneJob` with `createdAt` and `expiresAt`:

```ts
  createdAt: new Date("2026-05-09T00:00:00.000Z"),
  expiresAt: new Date("2026-06-08T00:00:00.000Z"),
```

Then add:

```ts
describe("translate.document.preview", () => {
  it("returns signed source, segments, html, and md URLs for a done job", async () => {
    pendingJobRow = doneJob
    const bucket = { head: vi.fn(async () => ({ size: 1 })) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { ...R2_ENV, BUCKET_PDFS: bucket as any }),
    })
    const out = await client.translate.document.preview({ jobId: "job-done" })
    expect(out.job).toMatchObject({
      id: "job-done",
      sourceFilename: "test.pdf",
      sourcePages: 5,
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
      status: "done",
      engine: "simple",
    })
    expect(out.sourcePdfUrl).toContain("source.pdf")
    expect(out.segmentsJsonUrl).toContain("segments.json")
    expect(out.htmlUrl).toContain("output.html")
    expect(out.mdUrl).toContain("output.md")
    expect(out.sourcePdfUrl).toContain("X-Amz-Signature")
    expect(bucket.head).toHaveBeenCalledWith("pdfs/u-free/job-done/source.pdf")
    expect(bucket.head).toHaveBeenCalledWith("pdfs/u-free/job-done/segments.json")
  })

  it("rejects BAD_REQUEST when preview job is not done", async () => {
    pendingJobRow = { ...doneJob, status: "processing" }
    const client = createRouterClient(router, { context: ctx(freeSession, R2_ENV) })
    await expect(client.translate.document.preview({ jobId: "job-done" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects NOT_FOUND when source or segments asset is missing", async () => {
    pendingJobRow = doneJob
    const bucket = { head: vi.fn(async (key: string) => key.endsWith("source.pdf") ? { size: 1 } : null) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { ...R2_ENV, BUCKET_PDFS: bucket as any }),
    })
    await expect(client.translate.document.preview({ jobId: "job-done" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
```

- [ ] **Step 2: Add failing retranslate API tests**

In the same test file, add:

```ts
describe("translate.document.retranslate", () => {
  it("creates a new queued job from a done source job with new settings", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = []
    const bucket = { head: vi.fn(async () => ({ size: 1 })) }
    const queue = { send: vi.fn(async () => undefined) }
    const client = createRouterClient(router, {
      context: ctx(freeSession, { BUCKET_PDFS: bucket as any, TRANSLATE_QUEUE: queue as any }),
    })

    const out = await client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "microsoft",
      sourceLang: "en",
      targetLang: "zh-TW",
    })

    expect(out.jobId).toBeTruthy()
    expect(out.jobId).not.toBe("job-done")
    expect(insertedJobs[0]).toMatchObject({
      userId: "u-free",
      sourceKey: doneJob.sourceKey,
      sourcePages: doneJob.sourcePages,
      sourceFilename: doneJob.sourceFilename,
      sourceBytes: doneJob.sourceBytes,
      modelId: "microsoft",
      sourceLang: "en",
      targetLang: "zh-TW",
      status: "queued",
      engine: "simple",
    })
    expect(queue.send).toHaveBeenCalledWith({ jobId: out.jobId })
    expect(bucket.head).toHaveBeenCalledWith(doneJob.sourceKey)
  })

  it("consumes quota for retranslation using the new job id", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = []
    const translateQuota = await import("../translate/quota")
    const client = createRouterClient(router, { context: ctx(freeSession) })
    const out = await client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })
    const [, calledUserId, calledBucket, calledPages, calledRequestId] =
      (translateQuota.consumeTranslateQuota as any).mock.calls[0]
    expect(calledUserId).toBe("u-free")
    expect(calledBucket).toBe("web_pdf_translate_monthly")
    expect(calledPages).toBe(doneJob.sourcePages)
    expect(calledRequestId).toBe(`web-pdf:u-free:${out.jobId}`)
  })

  it("rejects CONFLICT when another PDF job is active", async () => {
    pendingJobRow = doneJob
    pendingActiveJobs = [{ id: "active-job" }]
    const client = createRouterClient(router, { context: ctx(freeSession) })
    await expect(client.translate.document.retranslate({
      jobId: "job-done",
      modelId: "google",
      sourceLang: "en",
      targetLang: "zh-CN",
    })).rejects.toMatchObject({ code: "CONFLICT" })
  })
})
```

- [ ] **Step 3: Run focused API tests and verify they fail**

Run:

```bash
pnpm --filter @getu/api test -- src/orpc/__tests__/document-extras.test.ts
```

Expected: FAIL because `preview` and `retranslate` handlers are not exported.

- [ ] **Step 4: Implement shared signing helpers**

In `apps/api/src/orpc/translate/document.ts`, add imports from the contract:

```ts
  documentPreviewInputSchema,
  documentPreviewOutputSchema,
  documentRetranslateInputSchema,
  documentRetranslateOutputSchema,
```

Add helper functions near the retention constants:

```ts
const SIGNED_GET_EXPIRES_SEC = 3600

function toIso(value: Date | number | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

function requireR2Signer(env: Ctx["env"]): AwsClient {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_PDFS_NAME) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "R2 credentials not configured" })
  }
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  })
}

async function signR2GetUrl(env: Ctx["env"], key: string): Promise<string> {
  const aws = requireR2Signer(env)
  const objectUrl = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_PDFS_NAME}/${key}`
  const signed = await aws.sign(
    new Request(`${objectUrl}?X-Amz-Expires=${SIGNED_GET_EXPIRES_SEC}`, { method: "GET" }),
    { aws: { signQuery: true } },
  )
  return signed.url
}
```

Replace `documentDownloadUrl`'s local `AwsClient` construction with `signR2GetUrl(context.env, key)` and `SIGNED_GET_EXPIRES_SEC`.

- [ ] **Step 5: Implement `documentPreview`**

In `apps/api/src/orpc/translate/document.ts`, import:

```ts
import { buildDocumentOutputKeys } from "../../translate/document-keys"
```

Add the handler before `documentRetry`:

```ts
export const documentPreview = authed
  .input(documentPreviewInputSchema)
  .output(documentPreviewOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id
    const job = await db
      .select()
      .from(translationJobs)
      .where(and(eq(translationJobs.id, input.jobId), eq(translationJobs.userId, userId)))
      .get()
    if (!job) throw new ORPCError("NOT_FOUND", { message: "Job not found" })
    if (job.status !== "done") throw new ORPCError("BAD_REQUEST", { message: "Job not yet complete" })

    const { segmentsKey } = buildDocumentOutputKeys(job.userId, job.id)
    const bucket = context.env.BUCKET_PDFS
    if (bucket) {
      const [sourceHead, segmentsHead] = await Promise.all([
        bucket.head(job.sourceKey),
        bucket.head(segmentsKey),
      ])
      if (!sourceHead || !segmentsHead) {
        throw new ORPCError("NOT_FOUND", { message: "Preview assets not available" })
      }
    }

    const sourcePdfUrl = await signR2GetUrl(context.env, job.sourceKey)
    const segmentsJsonUrl = await signR2GetUrl(context.env, segmentsKey)
    const htmlUrl = job.outputHtmlKey ? await signR2GetUrl(context.env, job.outputHtmlKey) : null
    const mdUrl = job.outputMdKey ? await signR2GetUrl(context.env, job.outputMdKey) : null

    return {
      job: {
        id: job.id,
        sourceFilename: job.sourceFilename ?? null,
        sourcePages: job.sourcePages,
        sourceBytes: job.sourceBytes ?? null,
        modelId: job.modelId,
        sourceLang: job.sourceLang,
        targetLang: job.targetLang,
        status: "done",
        engine: job.engine,
        createdAt: toIso(job.createdAt),
        expiresAt: toIso(job.expiresAt),
      },
      sourcePdfUrl,
      segmentsJsonUrl,
      htmlUrl,
      mdUrl,
      expiresAt: new Date(Date.now() + SIGNED_GET_EXPIRES_SEC * 1000).toISOString(),
    }
  })
```

- [ ] **Step 6: Implement `documentRetranslate`**

Add this handler before the router export:

```ts
export const documentRetranslate = authed
  .input(documentRetranslateInputSchema)
  .output(documentRetranslateOutputSchema)
  .handler(async ({ context, input }) => {
    const db = createDb(context.env.DB)
    const userId = context.session.user.id
    const origJob = await db
      .select()
      .from(translationJobs)
      .where(and(eq(translationJobs.id, input.jobId), eq(translationJobs.userId, userId)))
      .get()
    if (!origJob) throw new ORPCError("NOT_FOUND", { message: "Job not found" })
    if (origJob.status !== "done" && origJob.status !== "failed") {
      throw new ORPCError("BAD_REQUEST", { message: "Only finished jobs can be retranslated" })
    }

    const ent = await loadEntitlements(db, userId, context.env.BILLING_ENABLED === "true")
    const plan = resolvePlan(ent.tier)
    const modelId = requireModelAccess(plan, input.modelId as TranslateModelId)

    const activeRows = await db
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
    if (activeRows.length > 0) {
      throw new ORPCError("CONFLICT", {
        message: "Another translation is already in progress",
        data: { code: "PDF_JOB_INFLIGHT", existingJobId: activeRows[0].id },
      })
    }

    const bucket = context.env.BUCKET_PDFS
    if (bucket) {
      const sourceObj = await bucket.head(origJob.sourceKey)
      if (!sourceObj) {
        throw new ORPCError("NOT_FOUND", { message: "源文件已过期，请重新上传 PDF" })
      }
    }

    const newJobId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + (plan === "free" ? FREE_PDF_RETENTION_MS : PRO_PDF_RETENTION_MS))

    try {
      await db.insert(translationJobs).values({
        id: newJobId,
        userId,
        sourceKey: origJob.sourceKey,
        sourcePages: origJob.sourcePages,
        sourceFilename: origJob.sourceFilename,
        sourceBytes: origJob.sourceBytes,
        modelId,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        engine: "simple",
        status: "queued",
        expiresAt,
        createdAt: new Date(),
      })
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new ORPCError("CONFLICT", {
          message: "Another translation is already in progress",
          data: { code: "PDF_JOB_INFLIGHT" },
        })
      }
      throw err
    }

    try {
      await consumeTranslateQuota(
        db,
        userId,
        "web_pdf_translate_monthly",
        origJob.sourcePages,
        `web-pdf:${userId}:${newJobId}`,
      )
    } catch (err) {
      await db.delete(translationJobs).where(eq(translationJobs.id, newJobId)).run()
      throw err
    }

    if (context.env.TRANSLATE_QUEUE) {
      await context.env.TRANSLATE_QUEUE.send({ jobId: newJobId })
    }

    return { jobId: newJobId }
  })
```

- [ ] **Step 7: Export new handlers**

Update `documentRouter`:

```ts
export const documentRouter = {
  create: documentCreate,
  status: documentStatus,
  list: documentList,
  downloadUrl: documentDownloadUrl,
  preview: documentPreview,
  retry: documentRetry,
  retranslate: documentRetranslate,
}
```

- [ ] **Step 8: Run focused API tests**

Run:

```bash
pnpm --filter @getu/api test -- src/orpc/__tests__/document-extras.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/orpc/translate/document.ts apps/api/src/orpc/__tests__/document-extras.test.ts
git commit -m "feat(api): add pdf preview retranslate endpoints"
```

## Task 5: Cleanup Handles Reused Source PDFs

**Files:**

- Modify: `apps/api/src/scheduled/translation-cleanup.ts`
- Modify: `apps/api/src/scheduled/__tests__/translation-cleanup.test.ts`

- [ ] **Step 1: Add failing cleanup test**

First extend the `insertJob` helper's `opts` type:

```ts
  opts: { id: string; userId: string; expiresAt: Date; sourceKey?: string; outputHtmlKey?: string; outputMdKey?: string },
```

Then change the inserted job's `sourceKey` value from:

```ts
    sourceKey: `pdfs/${opts.userId}/${opts.id}/source.pdf`,
```

to:

```ts
    sourceKey: opts.sourceKey ?? `pdfs/${opts.userId}/${opts.id}/source.pdf`,
```

Then add a test that inserts an expired retranslation job whose `sourceKey` points at another job prefix and whose output keys point at its own prefix:

```ts
it("deletes per-job outputs without assuming they share the source prefix", async () => {
  const { db } = makeTestDb()
  await insertUser(db, "u1")
  await insertJob(db, {
    id: "job-retranslated",
    userId: "u1",
    expiresAt: new Date(EXPIRED_MS),
    sourceKey: "pdfs/u1/original-job/source.pdf",
    outputHtmlKey: "pdfs/u1/job-retranslated/output.html",
    outputMdKey: "pdfs/u1/job-retranslated/output.md",
  })
  const r2Delete = vi.fn<(keys: string[]) => Promise<undefined>>(async () => undefined)
  const bucket = { delete: r2Delete } as unknown as R2Bucket

  await runTranslationCleanup(db as any, bucket, { now: NOW_MS })

  const deletedKeys = r2Delete.mock.calls[0]![0] as unknown as string[]
  expect(deletedKeys).toContain("pdfs/u1/original-job/source.pdf")
  expect(deletedKeys).toContain("pdfs/u1/job-retranslated/segments.json")
  expect(deletedKeys).toContain("pdfs/u1/job-retranslated/output.html")
  expect(deletedKeys).toContain("pdfs/u1/job-retranslated/output.md")
})
```

- [ ] **Step 2: Run focused cleanup test and verify it fails**

Run:

```bash
pnpm --filter @getu/api test -- src/scheduled/__tests__/translation-cleanup.test.ts
```

Expected: FAIL if cleanup derives `segments.json` from `sourceKey`.

- [ ] **Step 3: Use per-job segments key in cleanup**

Import:

```ts
import { buildSegmentsKey } from "../translate/document-keys"
```

When building keys for an expired job, include:

```ts
const keys = [
  job.sourceKey,
  buildSegmentsKey(job.userId, job.id),
  job.outputHtmlKey,
  job.outputMdKey,
].filter((key): key is string => typeof key === "string" && key.length > 0)
```

Use `keys` for bucket deletion and keep existing DB deletion behavior.

- [ ] **Step 4: Run focused cleanup test**

Run:

```bash
pnpm --filter @getu/api test -- src/scheduled/__tests__/translation-cleanup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scheduled/translation-cleanup.ts apps/api/src/scheduled/__tests__/translation-cleanup.test.ts
git commit -m "fix(api): cleanup pdf retranslation outputs"
```

## Task 6: Segment Parsing And Grouping Helpers

**Files:**

- Create: `apps/web/app/[locale]/document/preview/segments.ts`
- Create: `apps/web/app/[locale]/document/preview/__tests__/segments.test.ts`

- [ ] **Step 1: Write failing segment helper tests**

Create `apps/web/app/[locale]/document/preview/__tests__/segments.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { groupSegmentsByPage, parseSegmentsFile } from "../segments"

const validFile = {
  jobId: "j1",
  modelId: "google",
  sourceLang: "en",
  targetLang: "zh-CN",
  generatedAt: "2026-05-09T00:00:00.000Z",
  segments: [
    { index: 1, source: "A", translation: "甲", startPage: 2, endPage: 2, modelId: "google" },
    { index: 0, source: "B", translation: "乙", startPage: 1, endPage: 1, modelId: "google" },
    { index: 2, source: "C", translation: "丙", startPage: 2, endPage: 3, modelId: "google" },
  ],
}

describe("parseSegmentsFile", () => {
  it("accepts the queue segments file shape", () => {
    expect(parseSegmentsFile(validFile).jobId).toBe("j1")
  })

  it("rejects malformed segment payloads", () => {
    expect(() => parseSegmentsFile({ segments: "bad" })).toThrow("Invalid segments file")
  })
})

describe("groupSegmentsByPage", () => {
  it("groups by startPage and sorts by segment index", () => {
    const grouped = groupSegmentsByPage(parseSegmentsFile(validFile), 3)
    expect(grouped).toEqual([
      { page: 1, segments: [validFile.segments[1]] },
      { page: 2, segments: [validFile.segments[0], validFile.segments[2]] },
      { page: 3, segments: [] },
    ])
  })
})
```

- [ ] **Step 2: Run focused web test and verify it fails**

Run:

```bash
pnpm --filter @getu/web test -- 'app/[locale]/document/preview/__tests__/segments.test.ts'
```

Expected: FAIL because `../segments` does not exist.

- [ ] **Step 3: Implement segment helpers**

Create `apps/web/app/[locale]/document/preview/segments.ts`:

```ts
export type PdfSegment = {
  index: number
  source: string
  translation: string
  startPage: number
  endPage: number
  modelId: string
}

export type PdfSegmentsFile = {
  jobId: string
  modelId: string
  sourceLang: string
  targetLang: string
  segments: PdfSegment[]
  generatedAt: string
}

export type PageSegments = {
  page: number
  segments: PdfSegment[]
}

function isSegment(value: unknown): value is PdfSegment {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.index === "number"
    && typeof v.source === "string"
    && typeof v.translation === "string"
    && typeof v.startPage === "number"
    && typeof v.endPage === "number"
    && typeof v.modelId === "string"
}

export function parseSegmentsFile(value: unknown): PdfSegmentsFile {
  if (!value || typeof value !== "object") throw new Error("Invalid segments file")
  const v = value as Record<string, unknown>
  if (
    typeof v.jobId !== "string"
    || typeof v.modelId !== "string"
    || typeof v.sourceLang !== "string"
    || typeof v.targetLang !== "string"
    || typeof v.generatedAt !== "string"
    || !Array.isArray(v.segments)
    || !v.segments.every(isSegment)
  ) {
    throw new Error("Invalid segments file")
  }
  return v as PdfSegmentsFile
}

export function groupSegmentsByPage(file: PdfSegmentsFile, pageCount: number): PageSegments[] {
  const pages = Array.from({ length: pageCount }, (_, idx) => ({
    page: idx + 1,
    segments: [] as PdfSegment[],
  }))
  for (const segment of file.segments) {
    const page = pages[segment.startPage - 1]
    if (page) page.segments.push(segment)
  }
  for (const page of pages) {
    page.segments.sort((a, b) => a.index - b.index)
  }
  return pages
}
```

- [ ] **Step 4: Run focused web test**

Run:

```bash
pnpm --filter @getu/web test -- 'app/[locale]/document/preview/__tests__/segments.test.ts'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'apps/web/app/[locale]/document/preview/segments.ts' 'apps/web/app/[locale]/document/preview/__tests__/segments.test.ts'
git commit -m "feat(web): add pdf segment grouping helpers"
```

## Task 7: Add PDF.js Dependency And Source Pane

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/pdfjs-worker.d.ts`
- Create: `apps/web/app/[locale]/document/preview/pdf-source-pane.tsx`
- Create: `apps/web/app/[locale]/document/preview/pdf-outline-sidebar.tsx`

- [ ] **Step 1: Add dependency**

Run:

```bash
pnpm --filter @getu/web add pdfjs-dist
```

Expected: `apps/web/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Create PDF source pane**

Create `apps/web/app/[locale]/document/preview/pdf-source-pane.tsx`:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"

export type PdfOutlineItem = {
  title: string
  pageNumber: number
}

export function PdfSourcePane({
  url,
  pageCount,
  zoom,
  onPageChange,
  onOutline,
}: {
  url: string
  pageCount: number
  zoom: number
  onPageChange: (page: number) => void
  onOutline: (items: PdfOutlineItem[]) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let pdf: PDFDocumentProxy | null = null

    async function renderPage(page: PDFPageProxy, host: HTMLElement) {
      const viewport = page.getViewport({ scale: zoom })
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")
      if (!context) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.className = "pdf-reader-page-canvas"
      host.appendChild(canvas)
      await page.render({ canvasContext: context, viewport }).promise
    }

    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist")
        const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url")
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const doc = await pdfjs.getDocument(url).promise
        if (cancelled) return
        pdf = doc
        const host = containerRef.current
        if (!host) return
        host.replaceChildren()
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          const pageHost = document.createElement("section")
          pageHost.className = "pdf-reader-page"
          pageHost.dataset.page = String(pageNumber)
          host.appendChild(pageHost)
          const page = await doc.getPage(pageNumber)
          if (cancelled) return
          await renderPage(page, pageHost)
        }
        onOutline([])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render PDF")
      }
    }

    load()
    return () => {
      cancelled = true
      void pdf?.destroy()
    }
  }, [url, zoom, onOutline])

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const page = visible?.target instanceof HTMLElement
          ? Number(visible.target.dataset.page)
          : 0
        if (page > 0) onPageChange(page)
      },
      { root: host, threshold: [0.25, 0.5, 0.75] },
    )
    host.querySelectorAll(".pdf-reader-page").forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [pageCount, onPageChange])

  return (
    <div className="pdf-source-pane" ref={containerRef} aria-label="Source PDF">
      {error && <div className="pdf-reader-error" role="alert">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Create outline sidebar**

Create `apps/web/app/[locale]/document/preview/pdf-outline-sidebar.tsx`:

```tsx
"use client"

import type { PdfOutlineItem } from "./pdf-source-pane"

export function PdfOutlineSidebar({
  open,
  outline,
  pageCount,
  currentPage,
  onPageSelect,
}: {
  open: boolean
  outline: PdfOutlineItem[]
  pageCount: number
  currentPage: number
  onPageSelect: (page: number) => void
}) {
  if (!open) return null
  const items = outline.length > 0
    ? outline
    : Array.from({ length: pageCount }, (_, idx) => ({
        title: `Page ${idx + 1}`,
        pageNumber: idx + 1,
      }))
  return (
    <aside className="pdf-reader-sidebar" aria-label="PDF navigation">
      {items.map(item => (
        <button
          key={`${item.pageNumber}-${item.title}`}
          type="button"
          className={item.pageNumber === currentPage ? "active" : ""}
          onClick={() => onPageSelect(item.pageNumber)}
        >
          {item.title}
        </button>
      ))}
    </aside>
  )
}
```

- [ ] **Step 4: Add PDF.js worker import declaration**

Create `apps/web/pdfjs-worker.d.ts`:

```ts
declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const url: string
  export default url
}
```

- [ ] **Step 5: Type-check web package**

Run:

```bash
pnpm --filter @getu/web type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml 'apps/web/app/[locale]/document/preview/pdf-source-pane.tsx' 'apps/web/app/[locale]/document/preview/pdf-outline-sidebar.tsx' apps/web/pdfjs-worker.d.ts
git commit -m "feat(web): add pdfjs source pane"
```

## Task 8: Reader UI Components And Styles

**Files:**

- Create: `apps/web/app/[locale]/document/preview/translation-pane.tsx`
- Create: `apps/web/app/[locale]/document/preview/pdf-dual-reader.tsx`
- Modify: `apps/web/app/[locale]/document/styles.css`
- Modify: `apps/web/lib/i18n/messages.ts`

- [ ] **Step 1: Extend i18n message types and locales**

In `apps/web/lib/i18n/messages.ts`, extend `document.preview` type with:

```ts
      reader: {
        serviceLabel: string
        sourceLanguageLabel: string
        targetLanguageLabel: string
        retranslateButton: string
        retranslatingButton: string
        openNewFile: string
        download: string
        standardMode: string
        layoutModeComingSoon: string
        previousPage: string
        nextPage: string
        pageTemplate: string
        fitWidth: string
        zoomIn: string
        zoomOut: string
        showSidebar: string
        hideSidebar: string
        searchDisabled: string
        translatedPageTemplate: string
        emptyPage: string
      }
```

Add English messages:

```ts
        reader: {
          serviceLabel: "Translation service",
          sourceLanguageLabel: "Source language",
          targetLanguageLabel: "Target language",
          retranslateButton: "Retranslate",
          retranslatingButton: "Retranslating…",
          openNewFile: "Open new file",
          download: "Download",
          standardMode: "Standard Mode",
          layoutModeComingSoon: "Layout Mode coming soon",
          previousPage: "Previous page",
          nextPage: "Next page",
          pageTemplate: "{page} / {total}",
          fitWidth: "Fit width",
          zoomIn: "Zoom in",
          zoomOut: "Zoom out",
          showSidebar: "Show sidebar",
          hideSidebar: "Hide sidebar",
          searchDisabled: "Search unavailable in Standard Mode",
          translatedPageTemplate: "Translated page {page}",
          emptyPage: "No translated text detected on this page.",
        },
```

Add Simplified Chinese messages:

```ts
        reader: {
          serviceLabel: "翻译服务",
          sourceLanguageLabel: "源语言",
          targetLanguageLabel: "目标语言",
          retranslateButton: "重新翻译",
          retranslatingButton: "重新翻译中…",
          openNewFile: "打开新文件",
          download: "下载",
          standardMode: "标准模式",
          layoutModeComingSoon: "版式模式即将推出",
          previousPage: "上一页",
          nextPage: "下一页",
          pageTemplate: "{page} / {total}",
          fitWidth: "适合页宽",
          zoomIn: "放大",
          zoomOut: "缩小",
          showSidebar: "显示侧边栏",
          hideSidebar: "隐藏侧边栏",
          searchDisabled: "标准模式暂不支持搜索",
          translatedPageTemplate: "译文第 {page} 页",
          emptyPage: "这一页没有检测到可翻译文本。",
        },
```

Add Traditional Chinese messages:

```ts
        reader: {
          serviceLabel: "翻譯服務",
          sourceLanguageLabel: "來源語言",
          targetLanguageLabel: "目標語言",
          retranslateButton: "重新翻譯",
          retranslatingButton: "重新翻譯中…",
          openNewFile: "開啟新檔案",
          download: "下載",
          standardMode: "標準模式",
          layoutModeComingSoon: "版式模式即將推出",
          previousPage: "上一頁",
          nextPage: "下一頁",
          pageTemplate: "{page} / {total}",
          fitWidth: "適合頁寬",
          zoomIn: "放大",
          zoomOut: "縮小",
          showSidebar: "顯示側邊欄",
          hideSidebar: "隱藏側邊欄",
          searchDisabled: "標準模式暫不支援搜尋",
          translatedPageTemplate: "譯文第 {page} 頁",
          emptyPage: "這一頁沒有偵測到可翻譯文字。",
        },
```

- [ ] **Step 2: Create translation pane**

Create `apps/web/app/[locale]/document/preview/translation-pane.tsx`:

```tsx
"use client"

import type { PageSegments } from "./segments"

export function TranslationPane({
  pages,
  currentPage,
  labels,
  onPageSelect,
}: {
  pages: PageSegments[]
  currentPage: number
  labels: {
    translatedPageTemplate: string
    emptyPage: string
  }
  onPageSelect: (page: number) => void
}) {
  return (
    <div className="translation-pane" aria-label="Translated text">
      {pages.map(page => (
        <section
          key={page.page}
          className={`translation-page ${page.page === currentPage ? "active" : ""}`}
          onClick={() => onPageSelect(page.page)}
        >
          <h2>{labels.translatedPageTemplate.replace("{page}", String(page.page))}</h2>
          {page.segments.length === 0 ? (
            <p className="translation-page-empty">{labels.emptyPage}</p>
          ) : (
            page.segments.map(segment => (
              <article key={segment.index} className="translation-segment">
                <p>{segment.translation}</p>
                {segment.endPage > segment.startPage && (
                  <span className="translation-continuation">
                    {segment.startPage}–{segment.endPage}
                  </span>
                )}
              </article>
            ))
          )}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create dual reader component**

Create `apps/web/app/[locale]/document/preview/pdf-dual-reader.tsx` with this public interface:

```tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { TRANSLATE_MODELS, isFreeTranslateModel, type TranslateModelId } from "@getu/definitions"
import type { Entitlements } from "@getu/contract"
import type { Locale } from "@/lib/i18n/locales"
import type { Messages } from "@/lib/i18n/messages"
import { localeHref } from "@/lib/i18n/routing"
import { LangPicker } from "../../translate/components/LangPicker"
import { PdfOutlineSidebar } from "./pdf-outline-sidebar"
import { PdfSourcePane, type PdfOutlineItem } from "./pdf-source-pane"
import { TranslationPane } from "./translation-pane"
import { groupSegmentsByPage, type PdfSegmentsFile } from "./segments"

type ReaderLabels = Messages["document"]["preview"]["reader"]

export function PdfDualReader({
  locale,
  job,
  segments,
  sourcePdfUrl,
  htmlUrl,
  mdUrl,
  entitlements,
  labels,
  onRetranslate,
  retranslating,
}: {
  locale: Locale
  job: {
    id: string
    sourcePages: number
    modelId: string
    sourceLang: string
    targetLang: string
    sourceFilename: string | null
  }
  segments: PdfSegmentsFile
  sourcePdfUrl: string
  htmlUrl: string | null
  mdUrl: string | null
  entitlements: Entitlements | null
  labels: ReaderLabels
  onRetranslate: (input: { modelId: TranslateModelId; sourceLang: string; targetLang: string }) => void
  retranslating: boolean
}) {
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [outline, setOutline] = useState<PdfOutlineItem[]>([])
  const [draftModel, setDraftModel] = useState<TranslateModelId>(job.modelId as TranslateModelId)
  const [draftSource, setDraftSource] = useState(job.sourceLang)
  const [draftTarget, setDraftTarget] = useState(job.targetLang)

  const pages = useMemo(
    () => groupSegmentsByPage(segments, job.sourcePages),
    [segments, job.sourcePages],
  )
  const changed = draftModel !== job.modelId || draftSource !== job.sourceLang || draftTarget !== job.targetLang

  return (
    <div className="pdf-reader">
      <header className="pdf-reader-topbar">
        <strong className="pdf-reader-brand">GetU</strong>
        <label>
          <span>{labels.serviceLabel}</span>
          <select value={draftModel} onChange={e => setDraftModel(e.target.value as TranslateModelId)}>
            {TRANSLATE_MODELS.map(model => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="pdf-reader-lang">
          <span>{labels.sourceLanguageLabel}</span>
          <LangPicker
            source={draftSource}
            target={draftTarget}
            onSourceChange={setDraftSource}
            onTargetChange={setDraftTarget}
            onSwap={() => {
              if (draftSource === "auto") return
              setDraftSource(draftTarget)
              setDraftTarget(draftSource)
            }}
          />
        </div>
        <button
          type="button"
          className="button primary"
          disabled={!changed || retranslating}
          onClick={() => onRetranslate({ modelId: draftModel, sourceLang: draftSource, targetLang: draftTarget })}
        >
          {retranslating ? labels.retranslatingButton : labels.retranslateButton}
        </button>
        <button type="button" className="button secondary" onClick={() => router.push(localeHref(locale, "/document"))}>
          {labels.openNewFile}
        </button>
        <a className="button secondary" href={htmlUrl ?? mdUrl ?? "#"} target="_blank" rel="noreferrer">
          {labels.download}
        </a>
        <span className="pdf-reader-mode">{labels.standardMode}</span>
        <span className="pdf-reader-mode disabled">{labels.layoutModeComingSoon}</span>
      </header>

      <div className="pdf-reader-toolbar">
        <button type="button" onClick={() => setSidebarOpen(v => !v)}>
          {sidebarOpen ? labels.hideSidebar : labels.showSidebar}
        </button>
        <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>{labels.previousPage}</button>
        <span>{labels.pageTemplate.replace("{page}", String(currentPage)).replace("{total}", String(job.sourcePages))}</span>
        <button type="button" onClick={() => setCurrentPage(p => Math.min(job.sourcePages, p + 1))}>{labels.nextPage}</button>
        <button type="button" disabled>{labels.searchDisabled}</button>
        <button type="button" onClick={() => setZoom(z => Math.max(0.6, z - 0.1))}>{labels.zoomOut}</button>
        <button type="button" onClick={() => setZoom(1)}>{labels.fitWidth}</button>
        <button type="button" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>{labels.zoomIn}</button>
      </div>

      <div className="pdf-reader-body">
        <PdfOutlineSidebar
          open={sidebarOpen}
          outline={outline}
          pageCount={job.sourcePages}
          currentPage={currentPage}
          onPageSelect={setCurrentPage}
        />
        <div className="pdf-reader-columns">
          <PdfSourcePane
            url={sourcePdfUrl}
            pageCount={job.sourcePages}
            zoom={zoom}
            onPageChange={setCurrentPage}
            onOutline={setOutline}
          />
          <TranslationPane
            pages={pages}
            currentPage={currentPage}
            labels={labels}
            onPageSelect={setCurrentPage}
          />
        </div>
      </div>
    </div>
  )
}
```

After writing the file, remove unused imports if TypeScript reports them. In particular, remove `isFreeTranslateModel` if the first implementation gates Pro models in `PreviewClient`.

- [ ] **Step 4: Add reader CSS**

Append to `apps/web/app/[locale]/document/styles.css`:

```css
.pdf-reader {
  min-height: calc(100vh - 32px);
  background: #191919;
  color: #e8e8e8;
  display: flex;
  flex-direction: column;
}

.pdf-reader-topbar,
.pdf-reader-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  border-bottom: 1px solid #303030;
  background: #111;
}

.pdf-reader-toolbar {
  background: #191919;
  color: #d0d0d0;
}

.pdf-reader-brand {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pdf-reader-topbar label,
.pdf-reader-lang {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.pdf-reader-topbar select {
  border: 1px solid #3a3a3a;
  background: #202020;
  color: #fff;
  border-radius: 6px;
  padding: 6px 8px;
}

.pdf-reader-mode {
  border: 1px solid var(--accent);
  color: #fff;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
}

.pdf-reader-mode.disabled {
  color: #999;
  border-color: #444;
}

.pdf-reader-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.pdf-reader-sidebar {
  width: 260px;
  flex: 0 0 260px;
  background: #252525;
  border-right: 1px solid #343434;
  padding: 12px;
  overflow: auto;
}

.pdf-reader-sidebar button {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: #d8d8d8;
  padding: 8px;
  border-radius: 4px;
}

.pdf-reader-sidebar button.active {
  background: #3a3a3a;
  color: #fff;
}

.pdf-reader-columns {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
  gap: 12px;
  padding: 0 18px 28px;
  overflow: hidden;
}

.pdf-source-pane,
.translation-pane {
  overflow: auto;
  background: #202020;
  padding: 0 0 24px;
}

.pdf-reader-page,
.translation-page {
  background: #fff;
  color: #111;
  margin: 0 auto 16px;
  min-height: 520px;
  width: fit-content;
  max-width: 100%;
}

.pdf-reader-page-canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

.translation-page {
  width: min(100%, 860px);
  padding: 36px 44px;
  font-size: 14px;
  line-height: 1.65;
}

.translation-page h2 {
  margin: 0 0 18px;
  font-size: 14px;
  color: #555;
}

.translation-segment + .translation-segment {
  margin-top: 16px;
}

.translation-continuation {
  display: inline-block;
  margin-top: 4px;
  color: #777;
  font-size: 11px;
}

.translation-page-empty,
.pdf-reader-error {
  color: #666;
}

@media (max-width: 900px) {
  .pdf-reader-sidebar {
    display: none;
  }

  .pdf-reader-columns {
    grid-template-columns: 1fr;
  }

  .pdf-reader-topbar,
  .pdf-reader-toolbar {
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 5: Type-check web**

Run:

```bash
pnpm --filter @getu/web type-check
```

Expected: PASS after removing any unused imports.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n/messages.ts 'apps/web/app/[locale]/document/preview/translation-pane.tsx' 'apps/web/app/[locale]/document/preview/pdf-dual-reader.tsx' 'apps/web/app/[locale]/document/styles.css'
git commit -m "feat(web): add pdf dual reader ui"
```

## Task 9: Integrate Preview Client With Reader And Retranslate

**Files:**

- Modify: `apps/web/app/[locale]/document/preview/preview-client.tsx`
- Modify: `apps/web/app/[locale]/document/preview/preview-state.ts`
- Modify: `apps/web/app/[locale]/document/preview/__tests__/preview-state.test.ts`

- [ ] **Step 1: Update done state shape**

In `preview-state.ts`, replace the done state type with:

```ts
  | { kind: "done"; outputHtmlKey: string; outputMdKey: string }
```

Keep this shape for compatibility. No pure-state change is needed for preview URL loading because `PreviewClient` can load it after `state.kind === "done"`.

- [ ] **Step 2: Add imports to `PreviewClient`**

Add:

```ts
import { authClient } from "@/lib/auth-client"
import { isFreeTranslateModel, type TranslateModelId } from "@getu/definitions"
import type { DocumentPreviewOutput, Entitlements } from "@getu/contract"
import { UpgradeModal, type UpgradeModalSource } from "../../translate/components/UpgradeModal"
import { PdfDualReader } from "./pdf-dual-reader"
import { parseSegmentsFile, type PdfSegmentsFile } from "./segments"
```

Then keep the existing React import free of duplicate names.

- [ ] **Step 3: Add preview data state**

Inside `PreviewClient`, add:

```ts
  const session = authClient.useSession()
  const isAuthed = !!session.data?.user
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [preview, setPreview] = useState<DocumentPreviewOutput | null>(null)
  const [segments, setSegments] = useState<PdfSegmentsFile | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [retranslating, setRetranslating] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeSource, setUpgradeSource] = useState<UpgradeModalSource | null>(null)
```

Add entitlements effect:

```ts
  useEffect(() => {
    if (!isAuthed) {
      setEntitlements(null)
      return
    }
    let cancelled = false
    orpcClient.billing.getEntitlements({})
      .then(e => {
        if (!cancelled) setEntitlements(e)
      })
      .catch(() => {
        if (!cancelled) setEntitlements(null)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed])
```

- [ ] **Step 4: Load preview data after done**

Add:

```ts
  useEffect(() => {
    if (state.kind !== "done") return
    let cancelled = false
    setPreviewError(null)
    orpcClient.translate.document.preview({ jobId })
      .then(async payload => {
        const res = await fetch(payload.segmentsJsonUrl)
        if (!res.ok) throw new Error(`segments fetch failed: ${res.status}`)
        const json = await res.json()
        const parsed = parseSegmentsFile(json)
        if (!cancelled) {
          setPreview(payload)
          setSegments(parsed)
        }
      })
      .catch(err => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : messages.errors.notFound)
      })
    return () => {
      cancelled = true
    }
  }, [state.kind, jobId, messages.errors.notFound])
```

- [ ] **Step 5: Add retranslate handler**

Add helper:

```ts
  function openUpgradeModal(source: UpgradeModalSource) {
    setUpgradeSource(source)
    setUpgradeOpen(true)
  }
```

Add handler:

```ts
  const handleRetranslate = useCallback(async (input: {
    modelId: TranslateModelId
    sourceLang: string
    targetLang: string
  }) => {
    if (retranslating) return
    const tier = entitlements?.tier ?? "free"
    if (tier === "free" && !isFreeTranslateModel(input.modelId)) {
      openUpgradeModal("pro_model_clicked")
      return
    }
    setRetranslating(true)
    try {
      const out = await orpcClient.translate.document.retranslate({ ...input, jobId })
      router.push(localeHref(locale, `/document/preview?jobId=${out.jobId}`))
    } catch (err) {
      const code = (err as { data?: { code?: string }; code?: string })?.data?.code
        ?? (err as { code?: string })?.code
      if (code === "INSUFFICIENT_QUOTA" || code === "QUOTA_EXCEEDED") {
        openUpgradeModal("pdf_quota_exceeded")
      } else if (code === "PRO_REQUIRED") {
        openUpgradeModal("pro_model_clicked")
      }
      setRetranslating(false)
    }
  }, [entitlements?.tier, jobId, locale, retranslating, router])
```

- [ ] **Step 6: Replace iframe rendering**

At the top of the returned JSX, render the upgrade modal inside `TranslateShell`:

```tsx
      <UpgradeModal
        open={upgradeOpen}
        source={upgradeSource}
        onClose={() => setUpgradeOpen(false)}
        locale={locale}
        labels={upgradeLabels}
      />
```

Replace:

```tsx
          {state.kind === "done" && (
            <IframePreview jobId={jobId} messages={messages} />
          )}
```

with:

```tsx
          {state.kind === "done" && preview && segments && (
            <PdfDualReader
              locale={locale}
              job={preview.job}
              segments={segments}
              sourcePdfUrl={preview.sourcePdfUrl}
              htmlUrl={preview.htmlUrl}
              mdUrl={preview.mdUrl}
              entitlements={entitlements}
              labels={messages.reader}
              onRetranslate={handleRetranslate}
              retranslating={retranslating}
            />
          )}

          {state.kind === "done" && previewError && (
            <div className="document-error" role="alert">
              <strong>{messages.errors.heading}</strong>
              <p>{previewError}</p>
            </div>
          )}
```

Remove `IframePreview` once it is no longer used.

- [ ] **Step 7: Fix `PreviewClient` prop types**

Add an upgrade label type:

```ts
export type PreviewMessages = Messages["document"]["preview"]
export type UpgradeLabels = Messages["translate"]["upgradeModal"]
```

Update the component signature:

```ts
  upgradeLabels,
}: {
  jobId: string
  locale: Locale
  messages: PreviewMessages
  shellLabels: ShellLabels
  upgradeLabels: UpgradeLabels
})
```

Use `labels={upgradeLabels}` when rendering `UpgradeModal`.

- [ ] **Step 8: Pass upgrade labels from wrapper**

`PreviewClientWrapper` currently receives `messages: PreviewMessages`, so extend its props to receive `upgradeLabels: UpgradeLabels` and pass it through:

```tsx
      upgradeLabels={upgradeLabels}
```

Then update `apps/web/app/[locale]/document/preview/page.tsx` so the wrapper receives both `messages={messages.document.preview}` and `upgradeLabels={messages.translate.upgradeModal}`.

- [ ] **Step 9: Run web tests and type-check**

Run:

```bash
pnpm --filter @getu/web test -- 'app/[locale]/document/preview/__tests__/preview-state.test.ts' 'app/[locale]/document/preview/__tests__/segments.test.ts'
pnpm --filter @getu/web type-check
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add 'apps/web/app/[locale]/document/preview/preview-client.tsx' 'apps/web/app/[locale]/document/preview/preview-client-wrapper.tsx' 'apps/web/app/[locale]/document/preview/preview-state.ts' 'apps/web/app/[locale]/document/preview/__tests__/preview-state.test.ts'
git commit -m "feat(web): render pdf reader in document preview"
```

## Task 10: Full Verification

**Files:**

- No planned source edits. Fix only failures directly tied to this feature.

- [ ] **Step 1: Run API focused tests**

Run:

```bash
pnpm --filter @getu/api test -- src/translate/__tests__/document-keys.test.ts src/orpc/__tests__/document-extras.test.ts src/queue/__tests__/translate-document.test.ts src/scheduled/__tests__/translation-cleanup.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web focused tests**

Run:

```bash
pnpm --filter @getu/web test -- 'app/[locale]/document/preview/__tests__/preview-state.test.ts' 'app/[locale]/document/preview/__tests__/segments.test.ts'
```

Expected: PASS.

- [ ] **Step 3: Run package type-checks**

Run:

```bash
pnpm --filter @getu/contract type-check
pnpm --filter @getu/api type-check
pnpm --filter @getu/web type-check
```

Expected: PASS.

- [ ] **Step 4: Run full tests with extension live-API skip**

Run:

```bash
SKIP_FREE_API=true pnpm test
```

Expected: PASS. Extension free API tests may report intentional skips because `SKIP_FREE_API=true` is set.

- [ ] **Step 5: Build web**

Run:

```bash
pnpm --filter @getu/web build
```

Expected: PASS. This catches PDF.js worker/static export issues.

- [ ] **Step 6: Check final git state**

Run:

```bash
git status --short
```

Expected: no unstaged changes. If verification exposed failures, fix them in the task-specific files that caused the failure, rerun the matching command above, and commit those exact files with a focused `fix(...)` message before marking this task complete.

## Self-Review Checklist

- Spec coverage:
  - Preview route upgrade: Tasks 8 and 9.
  - PDF.js source rendering: Task 7.
  - Page-grouped translation: Task 6 and Task 8.
  - Editable controls with explicit retranslate: Task 4 and Task 9.
  - Per-job output keys: Tasks 2, 3, and 5.
  - Standard Mode and Layout Mode future signal: Task 8.
  - Tests and verification: Tasks 1 through 10.
- Placeholder scan:
  - No unresolved marker strings or incomplete implementation notes are intentionally present.
- Type consistency:
  - `DocumentPreviewOutput`, `documentPreview`, and `preview` use the same field names.
  - `DocumentRetranslateInput`, `documentRetranslate`, and `retranslate` use `{ jobId, modelId, sourceLang, targetLang }`.
  - Output key helpers consistently use `{ userId, jobId }`.
