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
  generatedAt: string // ISO 8601
}

export type TranslateChunkFn = (
  chunk: Chunk,
  ctx: { modelId: string; sourceLang: string; targetLang: string },
  signal: AbortSignal,
) => Promise<string>

export type ProgressUpdate = {
  stage: "extracting" | "translating" | "translated" | "rendering"
  pct: number
  chunk?: number
  chunkTotal?: number
}

export type ProgressWriter = (progress: ProgressUpdate) => Promise<void>

export type PipelineOpts = {
  jobId: string
  modelId: string
  sourceLang: string
  targetLang: string
  concurrency: number
  maxRetries: number
  baseBackoffMs: number
}

export async function runTranslationPipeline(
  chunks: Chunk[],
  translateChunk: TranslateChunkFn,
  writeProgress: ProgressWriter,
  opts: PipelineOpts,
  signal: AbortSignal,
): Promise<SegmentsFile> {
  const total = chunks.length

  if (total === 0) {
    return {
      jobId: opts.jobId,
      modelId: opts.modelId,
      sourceLang: opts.sourceLang,
      targetLang: opts.targetLang,
      segments: [],
      generatedAt: new Date().toISOString(),
    }
  }

  const results: (SegmentResult | undefined)[] = new Array(total)
  let done = 0
  // Progress milestones we've already emitted (Set makes emission idempotent)
  const emittedMilestones = new Set<number>()

  // Shared queue for work distribution across workers
  const queue = chunks.slice()

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      if (signal.aborted) {
        throw new DOMException("aborted", "AbortError")
      }
      const chunk = queue.shift()
      if (!chunk) return

      let attempt = 0
      let translation: string | null = null
      while (true) {
        if (signal.aborted) {
          throw new DOMException("aborted", "AbortError")
        }
        try {
          translation = await translateChunk(
            chunk,
            { modelId: opts.modelId, sourceLang: opts.sourceLang, targetLang: opts.targetLang },
            signal,
          )
          break
        } catch (err) {
          attempt++
          if (signal.aborted) throw err
          if (attempt >= opts.maxRetries) throw err
          const backoff = opts.baseBackoffMs * 2 ** (attempt - 1)
          await sleep(backoff)
        }
      }

      results[chunk.index] = {
        index: chunk.index,
        source: chunk.text,
        translation: translation!,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        modelId: opts.modelId,
      }

      done++
      const pct = Math.floor((done / total) * 100)
      // Emit at 25%, 50%, 75%, 100% milestones
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m && !emittedMilestones.has(m)) {
          emittedMilestones.add(m)
          await writeProgress({
            stage: m === 100 ? "translated" : "translating",
            pct: m,
            chunk: done,
            chunkTotal: total,
          })
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(opts.concurrency, total) }, () => worker())
  await Promise.all(workers)

  return {
    jobId: opts.jobId,
    modelId: opts.modelId,
    sourceLang: opts.sourceLang,
    targetLang: opts.targetLang,
    segments: results.filter((r): r is SegmentResult => r !== undefined),
    generatedAt: new Date().toISOString(),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
