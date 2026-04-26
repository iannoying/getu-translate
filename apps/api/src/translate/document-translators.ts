import type { TranslateModelId } from "@getu/definitions"
import { TRANSLATE_MODEL_BY_ID } from "@getu/definitions"
import type { Chunk } from "./document-chunker"
import type { TranslateChunkFn } from "./document-pipeline"
import { dispatchTranslate } from "./dispatch"

/**
 * Returns a TranslateChunkFn that translates one chunk via dispatchTranslate.
 * Wraps the existing google/microsoft/LLM dispatch logic for use in the
 * document translation pipeline.
 *
 * AbortSignal is currently unused — provider calls are uncancellable today.
 * When the underlying free-providers / LLM client gain abort support, plumb
 * the signal through to fetch.
 */
export function makeTranslateChunkFn(): TranslateChunkFn {
  return async (chunk: Chunk, ctx, _signal) => {
    if (!isKnownModelId(ctx.modelId)) {
      throw new Error(`unknown modelId: ${ctx.modelId}`)
    }
    const out = await dispatchTranslate(
      ctx.modelId,
      chunk.text,
      ctx.sourceLang,
      ctx.targetLang,
    )
    return out.text
  }
}

function isKnownModelId(id: string): id is TranslateModelId {
  return Object.prototype.hasOwnProperty.call(TRANSLATE_MODEL_BY_ID, id)
}
