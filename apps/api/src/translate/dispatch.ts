import type { TranslateModelId } from "@getu/definitions"
import { TRANSLATE_MODEL_BY_ID } from "@getu/definitions"
import { googleTranslate, microsoftTranslate } from "./free-providers"

export type DispatchTranslateResult = {
  text: string
  tokens: { input: number; output: number } | null
}

/**
 * Dispatches a single translation call to the appropriate provider.
 * - google / microsoft → real free-provider call (tokens=null)
 * - LLM models → stub returning prefixed source text (M6.5b will replace with real LLM)
 *
 * Used by both web /translate (text.ts) and web /document (document-translators.ts).
 */
export async function dispatchTranslate(
  modelId: TranslateModelId,
  text: string,
  source: string,
  target: string,
): Promise<DispatchTranslateResult> {
  if (modelId === "google") {
    return { text: await googleTranslate(text, source, target), tokens: null }
  }
  if (modelId === "microsoft") {
    return { text: await microsoftTranslate(text, source, target), tokens: null }
  }
  // LLM stub — see M6.5b. Token mock = roughly 1.3x char count for Pro
  // token-quota math.
  const inputTokens = Math.ceil(text.length / 4)
  const outputTokens = Math.ceil(text.length / 3)
  const display = TRANSLATE_MODEL_BY_ID[modelId].displayName
  return {
    text: `[Pro stub: ${display} 将在 M6.5b 接通] ${text}`,
    tokens: { input: inputTokens, output: outputTokens },
  }
}
