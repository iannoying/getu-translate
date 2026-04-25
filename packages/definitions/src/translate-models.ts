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
 *
 * Cost coefficients (LLM models only) are normalized to gpt-4o-mini input
 * token = 1 unit, matching `@getu/contract`'s convention so the two systems
 * can be reconciled later. Values here are placeholder estimates calibrated
 * against similar real-world models; **revisit during #M6.7 (Pro token
 * billing)** with current bianxie.ai / direct vendor pricing before going
 * live with the Pro plan.
 */

export type TranslateModelKind = "translate-api" | "llm"

interface TranslateModelBase {
  /** Stable identifier; persisted in user history rows and analytics. */
  readonly id: string
  /** Display label shown in the column header. Localizable later if needed. */
  readonly displayName: string
  /** `true` ⇒ logged-in free users may invoke this column. */
  readonly freeAvailable: boolean
}

/** Translator REST APIs — billed per character, not per token. */
export interface TranslateModelTranslateApi extends TranslateModelBase {
  readonly kind: "translate-api"
}

/** Chat LLMs — billed per input/output token, normalized to gpt-4o-mini = 1. */
export interface TranslateModelLlm extends TranslateModelBase {
  readonly kind: "llm"
  readonly costCoefficients: {
    readonly inputUnitCost: number
    readonly outputUnitCost: number
  }
}

export type TranslateModel = TranslateModelTranslateApi | TranslateModelLlm

export const TRANSLATE_MODELS = [
  // Free tier — character-billed translator APIs, no token cost concept.
  { id: "google", displayName: "谷歌翻译", kind: "translate-api", freeAvailable: true },
  { id: "microsoft", displayName: "微软翻译", kind: "translate-api", freeAvailable: true },

  // Pro tier — LLMs. Cost coefficients are PLACEHOLDER estimates pending
  // #M6.7 calibration. Pegged to gpt-4o-mini input = 1 unit (see file header).
  {
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 5, outputUnitCost: 15 },
  },
  {
    id: "qwen-3.5-plus",
    displayName: "Qwen 3.5 Plus",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 5, outputUnitCost: 15 },
  },
  {
    id: "glm-5.1",
    displayName: "GLM 5.1",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 5, outputUnitCost: 15 },
  },
  {
    id: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 1, outputUnitCost: 3 },
  },
  {
    id: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 15, outputUnitCost: 60 },
  },
  {
    id: "gpt-5.4-mini",
    displayName: "GPT-5.4 mini",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 1, outputUnitCost: 4 },
  },
  {
    id: "gpt-5.5",
    displayName: "GPT-5.5",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 50, outputUnitCost: 150 },
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 20, outputUnitCost: 75 },
  },
  {
    id: "coder-claude-4.7-opus",
    displayName: "Claude 4.7 Opus (coder)",
    kind: "llm",
    freeAvailable: false,
    costCoefficients: { inputUnitCost: 75, outputUnitCost: 200 },
  },
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

export function isLlmTranslateModel(model: TranslateModel): model is TranslateModelLlm {
  return model.kind === "llm"
}

/**
 * Token-cost in normalized units for a given LLM model. Mirrors
 * `@getu/contract`'s `normalizeTokens` so M6.7 can reuse the same accounting
 * shape.
 */
export function normalizeTranslateTokens(
  modelId: TranslateModelId,
  tokens: { input: number; output: number },
): number {
  const model = TRANSLATE_MODEL_BY_ID[modelId]
  if (!isLlmTranslateModel(model)) {
    throw new Error(
      `normalizeTranslateTokens: '${modelId}' is a ${model.kind} model and has no token cost`,
    )
  }
  const { inputUnitCost, outputUnitCost } = model.costCoefficients
  return Math.ceil(tokens.input * inputUnitCost + tokens.output * outputUnitCost)
}
