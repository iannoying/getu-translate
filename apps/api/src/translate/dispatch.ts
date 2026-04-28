import type { TranslateModelId } from "@getu/definitions"
import { TRANSLATE_MODEL_BY_ID } from "@getu/definitions"
import {
  bianxieLlmTranslate,
  type BianxieLlmEnv,
} from "./llm-providers"
import { googleTranslate, microsoftTranslate } from "./free-providers"

export type DispatchTranslateResult = {
  text: string
  tokens: { input: number; output: number } | null
}

/**
 * Dispatches a single translation call to the appropriate provider.
 * - google / microsoft → real free-provider call (tokens=null)
 * - 8 bianxie-published Pro LLMs → bianxie chat completion (real text + token usage)
 * - coder-claude-4.7-opus → throws TranslateProviderError (not on bianxie
 *   yet); caller surfaces PROVIDER_FAILED in the per-card UI. Add the entry
 *   to TRANSLATE_MODEL_TO_BIANXIE when bianxie publishes it.
 *
 * Used by both web /translate (text.ts) and web /document (queue consumer).
 */
export async function dispatchTranslate(
  modelId: TranslateModelId,
  text: string,
  source: string,
  target: string,
  env: BianxieLlmEnv,
): Promise<DispatchTranslateResult> {
  if (modelId === "google") {
    return { text: await googleTranslate(text, source, target), tokens: null }
  }
  if (modelId === "microsoft") {
    return { text: await microsoftTranslate(text, source, target), tokens: null }
  }
  // LLM kind — assert + delegate to bianxie. Unknown / not-yet-wired LLMs
  // bubble TranslateProviderError up to the caller's PROVIDER_FAILED wrap.
  const meta = TRANSLATE_MODEL_BY_ID[modelId]
  if (meta.kind !== "llm") {
    // Unreachable — TRANSLATE_MODELS only has translate-api or llm. Keep
    // the branch so future model kinds force a compile error here.
    throw new Error(`dispatchTranslate: unhandled model kind '${meta.kind}'`)
  }
  return bianxieLlmTranslate(modelId, text, source, target, env)
}
