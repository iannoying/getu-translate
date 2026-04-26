# M6.9 — Queue Consumer + unpdf + Chunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Cloudflare Queue consumer Worker that drains `getu-translate-jobs`, extracts text from R2-stored PDFs via `unpdf`, chunks paragraphs, translates each chunk via the user-selected model with bounded concurrency, persists per-chunk results to R2 (`segments.json`), and writes progress + status transitions back to D1.

**Architecture:**
- New module `apps/api/src/queue/translate-document.ts` with the `queue` handler.
- Re-exported from `apps/api/src/worker.ts` (the `ExportedHandler.queue` slot).
- PDF text extraction lives in `apps/api/src/translate/pdf-extract.ts` so it can be unit-tested without unpdf when needed (via dependency injection).
- Translation orchestration lives in `apps/api/src/translate/document-pipeline.ts` (chunking + concurrency + retry + state writes).
- M6.9 deliberately stops short of writing final HTML/MD outputs — it writes `segments.json` (intermediate) and leaves output keys NULL. M6.10 reads `segments.json` and produces HTML/MD.
- Job ends in status `processing` (not `done`) at end of M6.9 if M6.10 hasn't shipped yet — but in this PR we still set status='done' once segments.json exists, then M6.10 will reuse the same hook to upgrade to bilingual output. Actually: M6.9 must set status='translated' (a new transient status) OR leave 'processing' and let M6.10 add the next stage. **Decision (locked here): introduce no new statuses; M6.9 writes status='done' with `outputHtmlKey`/`outputMdKey` BOTH NULL** — UI shows "still processing" when those are null. M6.10 changes the writer to set the keys.

Wait — UI in M6.11 will distinguish "translated, awaiting render" from "fully done". Cleanest fix: M6.9 stays at 'processing' with progress.stage='translated', and M6.10 finishes the transition to 'done'. **Final decision (locked): M6.9 writes status='processing' with progress { stage: 'translated', pct: 100 }.** M6.10 transitions to 'done' after rendering. M6.11 reads these correctly.

**Tech Stack:** `unpdf@^1.x` (NEW dep) · Cloudflare Queues · drizzle-orm (D1) · vitest 4 · ai-sdk (already in repo for LLM calls).

**Issue:** [#176 (M6.9/13)](https://github.com/iannoying/getu-translate/issues/176)

**Pre-flight:**

- [ ] **Step 0.1: Pre-flight checklist (executor agent)**

```bash
pnpm install --frozen-lockfile
pnpm --filter @getu/api test -- --run
pnpm --filter @getu/api type-check
git status  # must be clean
```

- [ ] **Step 0.2: Confirm Cloudflare Queue exists**

Ask user (this plan execution must not assume): "Has `wrangler queues create getu-translate-jobs` been run on the Cloudflare account? If not, please run it now."

If it has not been run, halt and surface to user.

- [ ] **Step 0.3: Branch from main**

```bash
git fetch origin main
git checkout -b feature/m6-9-queue-consumer
```

---

## File structure (PR scope)

| File | Action | Responsibility |
|---|---|---|
| `apps/api/package.json` | Modify | Add `unpdf` dep |
| `apps/api/wrangler.toml` | Modify | Add `[[queues.consumers]]` + queue settings |
| `apps/api/src/env.ts` | Modify | Already has `TRANSLATE_QUEUE`; verify shape |
| `apps/api/src/translate/pdf-extract.ts` | Create | unpdf-backed PDF text extraction (page-aware) |
| `apps/api/src/translate/__tests__/pdf-extract.test.ts` | Create | Unit tests for chunking + scanned-PDF detection |
| `apps/api/src/translate/document-chunker.ts` | Create | Pure paragraph chunker (500-1500 chars, sentence-safe) |
| `apps/api/src/translate/__tests__/document-chunker.test.ts` | Create | Unit tests for chunker |
| `apps/api/src/translate/document-pipeline.ts` | Create | Chunk → translate → assemble pipeline (concurrency + retry) |
| `apps/api/src/translate/__tests__/document-pipeline.test.ts` | Create | Unit tests with mocked translator + DB |
| `apps/api/src/queue/translate-document.ts` | Create | Queue consumer entry; orchestrates job state machine |
| `apps/api/src/queue/__tests__/translate-document.test.ts` | Create | Integration test for the consumer with mocked R2/Queue |
| `apps/api/src/worker.ts` | Modify | Wire the `queue` handler |

---

## Task 1 — Add `unpdf` dependency

**Background:** unpdf is a serverless-friendly PDF text extraction library, designed to run in Workers without Node-only deps.

- [ ] **Step 1.1: Add dep**

```bash
pnpm --filter @getu/api add unpdf
```

- [ ] **Step 1.2: Verify lockfile change is clean**

```bash
git diff pnpm-lock.yaml apps/api/package.json | head -50
```

Expected: only adds `unpdf` (and possibly `pdfjs-dist` as transitive — both Worker-safe).

- [ ] **Step 1.3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add unpdf for PDF text extraction (M6.9)"
```

---

## Task 2 — PDF extraction module (`pdf-extract.ts`)

**Files:**
- Create: `apps/api/src/translate/pdf-extract.ts`
- Create: `apps/api/src/translate/__tests__/pdf-extract.test.ts`

- [ ] **Step 2.1: Write failing test**

```ts
// apps/api/src/translate/__tests__/pdf-extract.test.ts
import { describe, expect, it } from "vitest"
import { extractTextFromPdf, type PdfExtractResult } from "../pdf-extract"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const FIXTURES = resolve(__dirname, "fixtures")

describe("extractTextFromPdf", () => {
  it("extracts text from a regular PDF page-by-page", async () => {
    const buf = readFileSync(resolve(FIXTURES, "hello-world.pdf"))
    const result = await extractTextFromPdf(buf)
    expect(result.scanned).toBe(false)
    expect(result.pages.length).toBeGreaterThan(0)
    expect(result.pages[0].text).toContain("Hello")
  })

  it("flags a scanned PDF (no extractable text)", async () => {
    const buf = readFileSync(resolve(FIXTURES, "scanned-image.pdf"))
    const result = await extractTextFromPdf(buf)
    expect(result.scanned).toBe(true)
    expect(result.pages.every(p => p.text.trim().length === 0)).toBe(true)
  })
})
```

- [ ] **Step 2.2: Add fixtures**

Create two tiny PDF fixtures via `pdf-lib`:

```ts
// apps/api/src/translate/__tests__/fixtures/build-fixtures.ts
import { PDFDocument, StandardFonts } from "pdf-lib"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

async function helloWorld() {
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText("Hello, world!\nThis is page one.", { x: 50, y: 700, font, size: 18 })
  doc.addPage()  // intentionally empty second page
  const bytes = await doc.save()
  writeFileSync(resolve(__dirname, "hello-world.pdf"), bytes)
}

async function scanned() {
  const doc = await PDFDocument.create()
  doc.addPage()  // empty page = scanned-equivalent (no text in content stream)
  const bytes = await doc.save()
  writeFileSync(resolve(__dirname, "scanned-image.pdf"), bytes)
}

helloWorld().then(scanned).then(() => console.log("fixtures built"))
```

Run once: `tsx apps/api/src/translate/__tests__/fixtures/build-fixtures.ts`. Commit the resulting `.pdf` files (small, tens of KB) to the repo. The build script can stay too (DRY for future fixture additions).

- [ ] **Step 2.3: Run test to verify failure**

```bash
pnpm --filter @getu/api test pdf-extract -- --run
```

Expected: FAIL — module does not exist.

- [ ] **Step 2.4: Implement `pdf-extract.ts`**

```ts
// apps/api/src/translate/pdf-extract.ts
import { extractText, getDocumentProxy } from "unpdf"

export type PdfPage = {
  pageNumber: number
  text: string
}

export type PdfExtractResult = {
  pages: PdfPage[]
  scanned: boolean  // true if no page yielded text
  totalPages: number
}

export async function extractTextFromPdf(buffer: ArrayBuffer | Uint8Array): Promise<PdfExtractResult> {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const pdf = await getDocumentProxy(u8)
  const totalPages = pdf.numPages
  const pages: PdfPage[] = []
  for (let i = 1; i <= totalPages; i++) {
    const { text } = await extractText(pdf, { mergePages: false, page: i })
    pages.push({ pageNumber: i, text: typeof text === "string" ? text : Array.isArray(text) ? text.join("\n") : "" })
  }
  const scanned = pages.every(p => p.text.trim().length === 0)
  return { pages, scanned, totalPages }
}
```

(Adjust the unpdf API call to match the installed version — verify after `pnpm add` what the exact signature is. The implementer must read `node_modules/unpdf/dist/index.d.ts` if the above signature differs.)

- [ ] **Step 2.5: Run tests to verify pass**

```bash
pnpm --filter @getu/api test pdf-extract -- --run
```

Expected: PASS.

- [ ] **Step 2.6: Commit**

```bash
git add apps/api/src/translate/pdf-extract.ts \
        apps/api/src/translate/__tests__/pdf-extract.test.ts \
        apps/api/src/translate/__tests__/fixtures/
git commit -m "feat(api): add unpdf-backed PDF text extraction (M6.9)"
```

---

## Task 3 — Document chunker (`document-chunker.ts`)

**Files:**
- Create: `apps/api/src/translate/document-chunker.ts`
- Create: `apps/api/src/translate/__tests__/document-chunker.test.ts`

**Background:** Need a pure function that takes per-page text and returns 500–1500 char chunks split on paragraph boundaries (double-newline) and falling back to sentence boundaries when a paragraph exceeds 1500.

- [ ] **Step 3.1: Write failing tests**

```ts
// apps/api/src/translate/__tests__/document-chunker.test.ts
import { describe, expect, it } from "vitest"
import { chunkParagraphs, type Chunk } from "../document-chunker"

describe("chunkParagraphs", () => {
  it("merges short paragraphs up to ~1500 chars", () => {
    const text = "Para1.\n\nPara2.\n\nPara3.\n\n" + "x".repeat(200)
    const chunks = chunkParagraphs([{ pageNumber: 1, text }])
    expect(chunks.length).toBe(1)
    expect(chunks[0].text).toContain("Para1")
    expect(chunks[0].text).toContain("Para3")
  })

  it("splits a long paragraph at sentence boundary", () => {
    const sent = "This is a sentence. ".repeat(100)  // ~2000 chars
    const chunks = chunkParagraphs([{ pageNumber: 1, text: sent }])
    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk ends on a sentence boundary
    for (const c of chunks) {
      expect(c.text.trim()).toMatch(/[.!?]$/)
    }
  })

  it("preserves page numbers across chunks", () => {
    const chunks = chunkParagraphs([
      { pageNumber: 1, text: "Page1.\n\n" },
      { pageNumber: 2, text: "Page2.\n\n" },
    ])
    expect(chunks.find(c => c.text.includes("Page1"))?.startPage).toBe(1)
    expect(chunks.find(c => c.text.includes("Page2"))?.startPage).toBe(2)
  })

  it("never produces an empty chunk", () => {
    const chunks = chunkParagraphs([{ pageNumber: 1, text: "" }])
    expect(chunks.every(c => c.text.length > 0)).toBe(true)
  })

  it("handles single very long sentence by hard-splitting at 1500 chars", () => {
    const longLine = "x".repeat(3500)  // no sentence punctuation
    const chunks = chunkParagraphs([{ pageNumber: 1, text: longLine }])
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks.every(c => c.text.length <= 1500)).toBe(true)
  })
})
```

- [ ] **Step 3.2: Run tests — verify failure**

```bash
pnpm --filter @getu/api test document-chunker -- --run
```

Expected: FAIL.

- [ ] **Step 3.3: Implement chunker**

```ts
// apps/api/src/translate/document-chunker.ts
import type { PdfPage } from "./pdf-extract"

export type Chunk = {
  index: number
  text: string
  startPage: number
  endPage: number
}

const TARGET_MIN = 500
const TARGET_MAX = 1500

export function chunkParagraphs(pages: PdfPage[]): Chunk[] {
  const chunks: Chunk[] = []
  let buffer = ""
  let bufferStartPage = pages[0]?.pageNumber ?? 1
  let bufferEndPage = bufferStartPage

  const flush = () => {
    if (buffer.trim().length === 0) return
    chunks.push({
      index: chunks.length,
      text: buffer.trim(),
      startPage: bufferStartPage,
      endPage: bufferEndPage,
    })
    buffer = ""
  }

  for (const page of pages) {
    const paragraphs = page.text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    for (const para of paragraphs) {
      if (para.length > TARGET_MAX) {
        // flush whatever we have
        flush()
        bufferStartPage = page.pageNumber
        bufferEndPage = page.pageNumber
        // split this paragraph
        const split = splitOversizedParagraph(para)
        for (const piece of split) {
          chunks.push({
            index: chunks.length,
            text: piece,
            startPage: page.pageNumber,
            endPage: page.pageNumber,
          })
        }
        continue
      }
      if (buffer.length + para.length + 2 > TARGET_MAX) {
        flush()
        bufferStartPage = page.pageNumber
      }
      if (buffer.length === 0) bufferStartPage = page.pageNumber
      buffer += (buffer ? "\n\n" : "") + para
      bufferEndPage = page.pageNumber
    }
  }
  flush()
  return chunks
}

function splitOversizedParagraph(text: string): string[] {
  const out: string[] = []
  // Try sentence boundaries first
  const sentences = text.match(/[^.!?]+[.!?]+["']?\s*/g) ?? [text]
  let buf = ""
  for (const s of sentences) {
    if (buf.length + s.length > TARGET_MAX) {
      if (buf) out.push(buf.trim())
      if (s.length > TARGET_MAX) {
        // Hard-split at 1500
        for (let i = 0; i < s.length; i += TARGET_MAX) {
          out.push(s.slice(i, i + TARGET_MAX).trim())
        }
        buf = ""
      } else {
        buf = s
      }
    } else {
      buf += s
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}
```

- [ ] **Step 3.4: Run tests — verify pass**

```bash
pnpm --filter @getu/api test document-chunker -- --run
```

Expected: All 5 tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/translate/document-chunker.ts \
        apps/api/src/translate/__tests__/document-chunker.test.ts
git commit -m "feat(api): paragraph-aware chunker for PDF translation (M6.9)"
```

---

## Task 4 — Document pipeline (chunk → translate → state writes)

**Files:**
- Create: `apps/api/src/translate/document-pipeline.ts`
- Create: `apps/api/src/translate/__tests__/document-pipeline.test.ts`

**Background:** This is the core orchestration: takes a job row + extracted PDF + chunker output, fans out to the translator with concurrency=5, retries failed chunks 3x with exponential backoff, writes progress JSON every 25%, and persists `segments.json` to R2.

- [ ] **Step 4.1: Define interface**

```ts
// apps/api/src/translate/document-pipeline.ts
import type { Chunk } from "./document-chunker"

export type SegmentResult = {
  index: number
  source: string
  translation: string
  startPage: number
  endPage: number
  modelId: string
}

export type SegmentsFile = {
  jobId: string
  modelId: string
  sourceLang: string
  targetLang: string
  segments: SegmentResult[]
  generatedAt: string  // ISO
}

export type TranslateChunkFn = (
  chunk: Chunk,
  ctx: { modelId: string; sourceLang: string; targetLang: string },
  signal: AbortSignal,
) => Promise<string>

export type ProgressWriter = (progress: { stage: string; pct: number; chunk?: number; chunkTotal?: number }) => Promise<void>

export type PipelineOpts = {
  jobId: string
  modelId: string
  sourceLang: string
  targetLang: string
  concurrency: number  // 5
  maxRetries: number   // 3
  baseBackoffMs: number  // 1000
}

export async function runTranslationPipeline(
  chunks: Chunk[],
  translateChunk: TranslateChunkFn,
  writeProgress: ProgressWriter,
  opts: PipelineOpts,
  signal: AbortSignal,
): Promise<SegmentsFile> {
  // see Step 4.3 for body
}
```

- [ ] **Step 4.2: Write failing tests**

```ts
// apps/api/src/translate/__tests__/document-pipeline.test.ts
import { describe, expect, it, vi } from "vitest"
import { runTranslationPipeline, type TranslateChunkFn } from "../document-pipeline"
import type { Chunk } from "../document-chunker"

const mkChunks = (n: number): Chunk[] =>
  Array.from({ length: n }, (_, i) => ({
    index: i, text: `chunk-${i}`, startPage: 1, endPage: 1,
  }))

const opts = {
  jobId: "j1", modelId: "google", sourceLang: "en", targetLang: "zh-Hans",
  concurrency: 5, maxRetries: 3, baseBackoffMs: 10,
}

describe("runTranslationPipeline", () => {
  it("translates all chunks and returns SegmentsFile", async () => {
    const translate: TranslateChunkFn = async (c) => `translated-${c.index}`
    const progress = vi.fn(async () => {})
    const ac = new AbortController()
    const out = await runTranslationPipeline(mkChunks(3), translate, progress, opts, ac.signal)
    expect(out.segments.length).toBe(3)
    expect(out.segments[0].translation).toBe("translated-0")
  })

  it("writes progress at 25% / 50% / 75% / 100%", async () => {
    const translate: TranslateChunkFn = async (c) => `t-${c.index}`
    const progress = vi.fn(async () => {})
    const ac = new AbortController()
    await runTranslationPipeline(mkChunks(8), translate, progress, opts, ac.signal)
    // expected calls: at least at 25/50/75/100 + final 100
    const pcts = progress.mock.calls.map(c => c[0].pct).filter((x): x is number => typeof x === "number")
    expect(pcts).toContain(25)
    expect(pcts).toContain(50)
    expect(pcts).toContain(75)
    expect(pcts.at(-1)).toBe(100)
  })

  it("retries a failed chunk up to maxRetries", async () => {
    const calls: number[] = []
    const translate: TranslateChunkFn = async (c) => {
      calls.push(c.index)
      if (calls.filter(x => x === c.index).length < 3) throw new Error("flaky")
      return `t-${c.index}`
    }
    const ac = new AbortController()
    const out = await runTranslationPipeline(mkChunks(1), translate, async () => {}, opts, ac.signal)
    expect(calls.length).toBe(3)
    expect(out.segments[0].translation).toBe("t-0")
  })

  it("throws if a chunk fails after maxRetries", async () => {
    const translate: TranslateChunkFn = async () => { throw new Error("permanent") }
    const ac = new AbortController()
    await expect(
      runTranslationPipeline(mkChunks(1), translate, async () => {}, opts, ac.signal),
    ).rejects.toThrow(/permanent/)
  })

  it("respects concurrency limit", async () => {
    let inFlight = 0
    let max = 0
    const translate: TranslateChunkFn = async () => {
      inFlight++
      max = Math.max(max, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return "t"
    }
    const ac = new AbortController()
    await runTranslationPipeline(mkChunks(20), translate, async () => {}, { ...opts, concurrency: 5 }, ac.signal)
    expect(max).toBeLessThanOrEqual(5)
  })

  it("aborts when AbortSignal fires", async () => {
    const translate: TranslateChunkFn = async (_c, _ctx, signal) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 5)
    await expect(
      runTranslationPipeline(mkChunks(10), translate, async () => {}, opts, ac.signal),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 4.3: Implement pipeline**

```ts
// apps/api/src/translate/document-pipeline.ts (full body)
// ... (uses a simple semaphore for concurrency and a per-chunk retry loop with exponential backoff)
// Implementation outline:
// 1. Create a results array of length chunks.length
// 2. semaphore = concurrency; queue = chunks.slice()
// 3. workers = [...Array(concurrency)].map(async () => {
//      while (queue.length) {
//        const chunk = queue.shift()
//        let attempt = 0
//        while (true) {
//          try {
//            const t = await translateChunk(chunk, { modelId, sourceLang, targetLang }, signal)
//            results[chunk.index] = { ...chunk-derived data, translation: t, modelId }
//            done++
//            const pct = Math.floor((done / total) * 100)
//            if (pct >= nextProgressMilestone) {
//              await writeProgress({ stage: "translating", pct, chunk: done, chunkTotal: total })
//              nextProgressMilestone += 25
//            }
//            break
//          } catch (e) {
//            if (signal.aborted) throw e
//            attempt++
//            if (attempt >= maxRetries) throw e
//            await sleep(baseBackoffMs * 2 ** (attempt - 1))
//          }
//        }
//      }
//    })
// 4. await Promise.all(workers)
// 5. await writeProgress({ stage: "translated", pct: 100 })
// 6. return SegmentsFile
```

(The full implementation is straightforward; the executing agent writes it from this outline. Keep total file under 200 lines.)

- [ ] **Step 4.4: Run tests — verify pass**

```bash
pnpm --filter @getu/api test document-pipeline -- --run
```

Expected: All 6 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/translate/document-pipeline.ts \
        apps/api/src/translate/__tests__/document-pipeline.test.ts
git commit -m "feat(api): document translation pipeline with concurrency + retry (M6.9)"
```

---

## Task 5 — Per-model `translateChunk` wiring

**Files:**
- Create: `apps/api/src/translate/document-translators.ts`
- Create: `apps/api/src/translate/__tests__/document-translators.test.ts`

**Background:** Bridge between the abstract `TranslateChunkFn` and the actual provider calls. For free providers (google, microsoft) we reuse `free-providers.ts` directly. For LLM providers, we use the existing `bianxie` / ai-sdk pathway with a system prompt.

- [ ] **Step 5.1: Write failing test (one case per branch)**

```ts
// apps/api/src/translate/__tests__/document-translators.test.ts
import { describe, expect, it, vi } from "vitest"
import { makeTranslateChunkFn } from "../document-translators"
import type { Chunk } from "../document-chunker"

const chunk: Chunk = { index: 0, text: "Hello.", startPage: 1, endPage: 1 }
const ctx = { modelId: "google", sourceLang: "auto", targetLang: "zh-Hans" }

describe("makeTranslateChunkFn", () => {
  it("uses googleTranslate for modelId=google", async () => {
    const fakeFetch = vi.fn(async () => new Response(JSON.stringify([[["你好", "Hello.", null, null, 0]]]), { status: 200 })) as unknown as typeof fetch
    const fn = makeTranslateChunkFn({ fetchImpl: fakeFetch, env: {} as any })
    const out = await fn(chunk, ctx, new AbortController().signal)
    expect(out).toContain("你好")
  })

  it("uses microsoftTranslate for modelId=microsoft", async () => { /* analogous */ })

  it("uses LLM proxy for modelId=gpt-5.5", async () => { /* mocked ai-sdk */ })

  it("throws on unknown modelId", async () => {
    const fn = makeTranslateChunkFn({ fetchImpl: fetch, env: {} as any })
    await expect(fn(chunk, { ...ctx, modelId: "nope" }, new AbortController().signal))
      .rejects.toThrow(/unknown model/i)
  })
})
```

- [ ] **Step 5.2: Implement `document-translators.ts`**

```ts
// apps/api/src/translate/document-translators.ts
import { googleTranslate, microsoftTranslate } from "./free-providers"
import type { TranslateChunkFn } from "./document-pipeline"
import { TRANSLATE_MODELS } from "@getu/definitions"
import type { WorkerEnv } from "../env"

export type TranslateChunkOpts = {
  fetchImpl?: typeof fetch
  env: WorkerEnv
}

export function makeTranslateChunkFn(opts: TranslateChunkOpts): TranslateChunkFn {
  const fetchImpl = opts.fetchImpl ?? fetch
  return async (chunk, ctx, signal) => {
    const model = TRANSLATE_MODELS.find(m => m.id === ctx.modelId)
    if (!model) throw new Error(`unknown model: ${ctx.modelId}`)

    if (ctx.modelId === "google") {
      return googleTranslate(chunk.text, ctx.sourceLang, ctx.targetLang, fetchImpl)
    }
    if (ctx.modelId === "microsoft") {
      return microsoftTranslate(chunk.text, ctx.sourceLang, ctx.targetLang, fetchImpl)
    }
    // LLM path — call bianxie proxy via ai-sdk
    return llmTranslate(chunk.text, ctx, opts.env, signal, fetchImpl)
  }
}

async function llmTranslate(
  text: string,
  ctx: { modelId: string; sourceLang: string; targetLang: string },
  env: WorkerEnv,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  // ... call bianxie proxy or ai-sdk; system prompt:
  //   "Translate the following text from {sourceLang} to {targetLang}.
  //    Preserve formatting (paragraph breaks). Output only the translation."
  // Implementation reuses existing M6.5 LLM stub if real ai-sdk is not yet wired.
}
```

The executing agent reads `apps/extension/src/utils/providers/options.ts` (the canonical LLM call site) for the exact ai-sdk invocation pattern and ports it.

- [ ] **Step 5.3: Run tests — verify pass**

```bash
pnpm --filter @getu/api test document-translators -- --run
```

- [ ] **Step 5.4: Commit**

```bash
git add apps/api/src/translate/document-translators.ts \
        apps/api/src/translate/__tests__/document-translators.test.ts
git commit -m "feat(api): per-model translateChunk wiring for document pipeline (M6.9)"
```

---

## Task 6 — Queue consumer entry (`queue/translate-document.ts`)

**Files:**
- Create: `apps/api/src/queue/translate-document.ts`
- Create: `apps/api/src/queue/__tests__/translate-document.test.ts`

**Background:** This is the entry point Cloudflare calls for each batch of queue messages. For each `{ jobId }`:
1. Load the job row from D1.
2. Transition status to 'processing' with progress { stage: 'extracting', pct: 0 }.
3. Fetch source.pdf from R2.
4. Run extractTextFromPdf.
5. If scanned → fail with the canonical message; refund quota; ack the message.
6. Run chunkParagraphs.
7. Run runTranslationPipeline with `makeTranslateChunkFn`.
8. Write segments.json to R2 at `pdfs/{userId}/{jobId}/segments.json`.
9. Update progress { stage: 'translated', pct: 100 } — keep status='processing'. (M6.10 transitions to 'done'.)
10. ack.

On any error: status='failed', errorMessage, refund quota, ack (do not requeue — Workers Queues will retry up to maxRetries=2 if we return without acking, but we want explicit control).

- [ ] **Step 6.1: Write integration test**

```ts
// apps/api/src/queue/__tests__/translate-document.test.ts
import { describe, expect, it, vi } from "vitest"
import { createQueueHandler } from "../translate-document"
import { makeTestDb } from "../../__tests__/utils/test-db"
import { translationJobs, user } from "@getu/db/schema"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("queue translate-document handler", () => {
  it("happy path: queued -> processing -> segments.json written", async () => {
    const { db } = makeTestDb()
    await db.insert(user).values({ id: "u1", email: "u1@test", name: "u1", emailVerified: 1, createdAt: new Date(), updatedAt: new Date() })
    const jobId = "job-1"
    const userId = "u1"
    await db.insert(translationJobs).values({
      id: jobId, userId, sourceKey: `pdfs/${userId}/${jobId}/source.pdf`,
      sourcePages: 1, modelId: "google", sourceLang: "auto", targetLang: "zh-Hans",
      engine: "simple", status: "queued",
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    })

    const pdfBuf = readFileSync(resolve(__dirname, "../../translate/__tests__/fixtures/hello-world.pdf"))
    const r2Get = vi.fn(async (key: string) => key.endsWith("source.pdf") ? { arrayBuffer: async () => pdfBuf.buffer } : null)
    const r2Put = vi.fn(async () => {})

    const handler = createQueueHandler({
      db,
      bucket: { get: r2Get, put: r2Put } as unknown as R2Bucket,
      env: {} as any,
      translateChunk: async () => "你好",
    })

    const batch = { messages: [{ id: "m1", body: { jobId }, ack: vi.fn(), retry: vi.fn() }] }
    await handler.queue(batch as any, {} as any, {} as any)

    // segments.json written
    expect(r2Put).toHaveBeenCalledWith(
      `pdfs/${userId}/${jobId}/segments.json`,
      expect.any(String),
      expect.objectContaining({ httpMetadata: expect.any(Object) }),
    )

    // job state
    const [job] = await db.select().from(translationJobs).where(/* eq id */)
    expect(job.status).toBe("processing")
    expect(JSON.parse(job.progress!)).toMatchObject({ stage: "translated", pct: 100 })
  })

  it("scanned PDF fails with canonical message and refunds quota", async () => { /* mirror happy path with scanned fixture */ })
  it("LLM all-retry exhausted fails the job", async () => { /* mock translateChunk to always throw */ })
  it("R2 source missing fails the job", async () => { /* r2Get returns null */ })
  it("does not double-process if status is already done/failed", async () => { /* idempotency */ })
})
```

- [ ] **Step 6.2: Implement consumer**

```ts
// apps/api/src/queue/translate-document.ts
import { eq } from "drizzle-orm"
import type { Db } from "@getu/db"
import { translationJobs, usageLog, quotaPeriod } from "@getu/db/schema"
import { extractTextFromPdf } from "../translate/pdf-extract"
import { chunkParagraphs } from "../translate/document-chunker"
import { runTranslationPipeline, type TranslateChunkFn } from "../translate/document-pipeline"
import type { WorkerEnv } from "../env"

export type CreateQueueHandlerOpts = {
  db: Db
  bucket: R2Bucket
  env: WorkerEnv
  translateChunk?: TranslateChunkFn  // override for tests; default uses makeTranslateChunkFn
}

export function createQueueHandler(opts: CreateQueueHandlerOpts) {
  return {
    async queue(batch: MessageBatch<{ jobId: string }>, env: WorkerEnv, ctx: ExecutionContext) {
      for (const msg of batch.messages) {
        try {
          await processOne(msg.body.jobId, opts)
          msg.ack()
        } catch (err) {
          // Already wrote status='failed' inside processOne, so ack to avoid infinite retry.
          console.error("[queue.translate-document] terminal error", err)
          msg.ack()
        }
      }
    },
  }
}

async function processOne(jobId: string, opts: CreateQueueHandlerOpts) {
  // 1. load job
  // 2. idempotency: skip if status in ('done', 'failed')
  // 3. set status='processing' progress { stage: 'extracting', pct: 0 }
  // 4. fetch R2 source
  // 5. extractTextFromPdf
  // 6. if scanned -> fail + refund + return
  // 7. chunkParagraphs
  // 8. runTranslationPipeline with progress writer that updates D1
  // 9. r2.put segments.json
  // 10. set progress { stage: 'translated', pct: 100 }, keep status='processing'
}

async function refundQuota(db: Db, jobId: string, userId: string, amount: number) {
  // INSERT usageLog with negative amount, requestId=`refund:${jobId}`
  // UPSERT quotaPeriod -= amount (clamp at 0)
  // UNIQUE(userId, requestId) makes it idempotent
}
```

- [ ] **Step 6.3: Run tests — verify all 5 pass**

```bash
pnpm --filter @getu/api test queue/translate-document -- --run
```

- [ ] **Step 6.4: Commit**

```bash
git add apps/api/src/queue/ 
git commit -m "feat(api): Cloudflare Queue consumer for PDF translation jobs (M6.9)"
```

---

## Task 7 — Wire `worker.ts` and `wrangler.toml`

**Files:**
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/wrangler.toml`

- [ ] **Step 7.1: Update worker.ts**

```ts
// apps/api/src/worker.ts
import app from "./index"
import { createDb } from "@getu/db"
import { runRetention } from "./scheduled/retention"
import { createQueueHandler } from "./queue/translate-document"
import type { WorkerEnv } from "./env"

const queueHandler = createQueueHandler({
  // bucket / db / env are resolved per request inside the handler since they're env-scoped;
  // refactor createQueueHandler to take a factory, OR move db/bucket resolution inside processOne.
})

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    const db = createDb(env.DB)
    ctx.waitUntil(runRetention(db, { now: Date.now(), retentionDays: 30 }))
  },
  async queue(batch, env, ctx) {
    const db = createDb(env.DB)
    const bucket = env.BUCKET_PDFS
    if (!bucket) {
      // Dev environment without R2 — ack to avoid infinite retry
      for (const m of batch.messages) m.ack()
      return
    }
    const handler = createQueueHandler({ db, bucket, env })
    return handler.queue(batch, env, ctx)
  },
} satisfies ExportedHandler<WorkerEnv, { jobId: string }>
```

- [ ] **Step 7.2: Add `[[queues.consumers]]` to wrangler.toml**

```toml
[[queues.consumers]]
queue = "getu-translate-jobs"
max_batch_size = 1
max_batch_timeout = 5
max_retries = 2
dead_letter_queue = "getu-translate-jobs-dlq"
```

(Confirm DLQ name with user before merging — they may want a different convention. If user prefers no DLQ for now, drop the line and note in PR description.)

- [ ] **Step 7.3: Type-check**

```bash
pnpm --filter @getu/api type-check
```

Expected: PASS.

- [ ] **Step 7.4: Commit**

```bash
git add apps/api/src/worker.ts apps/api/wrangler.toml
git commit -m "feat(api): wire queue consumer into worker entry (M6.9)"
```

---

## Task 8 — Local end-to-end smoke test

**Background:** `wrangler dev` supports local queues via `--local-protocol`. Verify the consumer works against a real local Worker before opening the PR.

- [ ] **Step 8.1: Start dev server**

```bash
cd apps/api && pnpm dev
```

(In background.) Wait for `[wrangler] Ready on http://localhost:8787`.

- [ ] **Step 8.2: Manual upload + observe**

Using the web app dev server (`pnpm --filter @getu/web dev`), upload a small PDF via `/document`. Observe:
- Wrangler dev logs show the queue message arrive
- D1 row transitions queued → processing
- R2 (local Miniflare) receives `segments.json`
- Final progress = `{ stage: 'translated', pct: 100 }`

Document the smoke test result in the PR body. If smoke test reveals a real bug, fix it as additional commits BEFORE opening the PR.

- [ ] **Step 8.3: Stop dev server**

---

## Task 9 — Open the PR

- [ ] **Step 9.1: Push**

```bash
git push -u origin feature/m6-9-queue-consumer
```

- [ ] **Step 9.2: Open PR**

```bash
gh pr create \
  --title "feat(api): Cloudflare Queue consumer + unpdf parsing + chunking (M6.9)" \
  --body "$(cat <<'EOF'
## Summary

Closes #176 (M6.9/13).

Implements the Cloudflare Queue consumer Worker that drains \`getu-translate-jobs\` produced by M6.8's \`documentCreate\`, extracts text via \`unpdf\`, chunks paragraphs (500–1500 chars, sentence-safe), translates each chunk via the user-selected model (concurrency=5, 3 retries with exponential backoff), and writes \`segments.json\` to R2 plus progress to D1.

## Architecture

- New module: \`apps/api/src/queue/translate-document.ts\` — the Queue consumer handler
- New module: \`apps/api/src/translate/pdf-extract.ts\` — unpdf wrapper
- New module: \`apps/api/src/translate/document-chunker.ts\` — pure chunker
- New module: \`apps/api/src/translate/document-pipeline.ts\` — orchestration
- New module: \`apps/api/src/translate/document-translators.ts\` — per-model bridge
- Wire-up: \`apps/api/src/worker.ts\` adds the \`queue\` handler
- Config: \`apps/api/wrangler.toml\` adds \`[[queues.consumers]]\`

## State machine

- queued → processing (progress: extracting/translating/translated, pct 0..100)
- terminal → failed (with refund) on scanned PDFs, R2 misses, or 3-retry exhaustion
- M6.10 takes over to transition processing → done after writing HTML/MD outputs

## Test Plan

- [ ] \`pnpm -r test\` green
- [ ] \`pnpm -r type-check\` green
- [ ] Local smoke: upload 5-page PDF, observe segments.json written
- [ ] Local smoke: upload scanned PDF, observe canonical error message + quota refund

## Operational notes

- Requires \`wrangler queues create getu-translate-jobs\` (verified by user)
- Requires \`wrangler queues create getu-translate-jobs-dlq\` (NEW — please confirm DLQ acceptable)
- \`unpdf\` added as a runtime dep (Workers-safe, no Node deps)

## Reviewer

[Filled by code-reviewer subagent]

## Codex review

[Filled by codex adversarial-review or marked as \`skipped after 5min timeout\`]
EOF
)"
```

- [ ] **Step 9.3: Watch CI + reviewers; auto-merge on green**

```bash
gh pr checks --watch
# After CI green AND reviewer subagent approves AND codex review (or 5min timeout):
gh pr merge --auto --squash
```

---

## Self-review checklist (before opening PR)

- [ ] All 6 implementation tasks committed (one feature per commit)
- [ ] Pre-flight commands all green
- [ ] Smoke test executed and result recorded in PR body
- [ ] No new dependencies beyond `unpdf` (any extras must be flagged to user)
- [ ] DLQ binding confirmed with user OR removed
- [ ] Refund logic tested end-to-end (the integration test asserts negative usageLog row exists)
- [ ] No CHECK constraint violation in migrations (status enum unchanged)
