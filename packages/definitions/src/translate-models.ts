/**
 * Web /translate model registry — drives the multi-column comparison UI on
 * https://getutranslate.com/translate.
 *
 * Two free models (Google / Microsoft Translator REST APIs) plus nine Pro LLMs.
 * Free users see all 11 columns but only the two free columns send real
 * requests; the LLM columns render an upgrade prompt instead. Pro users get
 * streaming responses across all nine LLM columns.
 *
 * Distinct from `@getu/contract`'s `AI_MODEL_COEFFICIENTS` whitelist, which
 * controls the extension's AI proxy cost accounting. These two registries
 * intentionally do not overlap today: this one is the web product surface,
 * the other is the extension's metered AI gateway.
 *
 * Adding a model is a metadata-only change here; provider wiring (API key
 * lookup, ai-sdk client) lives in `apps/api/src/orpc/translate/`.
 */

export type TranslateModelKind = "translate-api" | "llm"

export interface TranslateModel {
  /** Stable identifier; persisted in user history rows and analytics. */
  readonly id: string
  /** Display label shown in the column header. Localizable later if needed. */
  readonly displayName: string
  /** `translate-api` calls Google/Microsoft REST. `llm` calls a chat LLM. */
  readonly kind: TranslateModelKind
  /** `true` ⇒ logged-in free users may invoke this column. */
  readonly freeAvailable: boolean
}

export const TRANSLATE_MODELS = [
  { id: "google", displayName: "谷歌翻译", kind: "translate-api", freeAvailable: true },
  { id: "microsoft", displayName: "微软翻译", kind: "translate-api", freeAvailable: true },
  { id: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro", kind: "llm", freeAvailable: false },
  { id: "qwen-3.5-plus", displayName: "Qwen 3.5 Plus", kind: "llm", freeAvailable: false },
  { id: "glm-5.1", displayName: "GLM 5.1", kind: "llm", freeAvailable: false },
  { id: "gemini-3-flash-preview", displayName: "Gemini 3 Flash", kind: "llm", freeAvailable: false },
  { id: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro", kind: "llm", freeAvailable: false },
  { id: "gpt-5.4-mini", displayName: "GPT-5.4 mini", kind: "llm", freeAvailable: false },
  { id: "gpt-5.5", displayName: "GPT-5.5", kind: "llm", freeAvailable: false },
  { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", kind: "llm", freeAvailable: false },
  { id: "coder-claude-4.7-opus", displayName: "Claude 4.7 Opus (coder)", kind: "llm", freeAvailable: false },
] as const satisfies readonly TranslateModel[]

export type TranslateModelId = (typeof TRANSLATE_MODELS)[number]["id"]

export const TRANSLATE_MODEL_BY_ID: Readonly<Record<TranslateModelId, TranslateModel>> =
  Object.freeze(
    TRANSLATE_MODELS.reduce(
      (acc, model) => {
        acc[model.id] = model
        return acc
      },
      {} as Record<TranslateModelId, TranslateModel>,
    ),
  )

export const FREE_TRANSLATE_MODEL_IDS: readonly TranslateModelId[] = TRANSLATE_MODELS
  .filter(m => m.freeAvailable)
  .map(m => m.id)

export const PRO_TRANSLATE_MODEL_IDS: readonly TranslateModelId[] = TRANSLATE_MODELS
  .filter(m => !m.freeAvailable)
  .map(m => m.id)

export function isTranslateModelId(value: string): value is TranslateModelId {
  return value in TRANSLATE_MODEL_BY_ID
}

export function isFreeTranslateModel(id: TranslateModelId): boolean {
  return TRANSLATE_MODEL_BY_ID[id].freeAvailable
}
