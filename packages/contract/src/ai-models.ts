/**
 * AI model cost coefficients, normalized to the baseline Pro model input token = 1 unit.
 * Update ONLY when bianxie.ai pricing changes or we add a new whitelist entry.
 * Output cost is typically 3-4x input cost per the underlying provider pricing.
 */
export const AI_MODEL_COEFFICIENTS = {
  "deepseek-v4-pro": { inputUnitCost: 1, outputUnitCost: 4 },
  "qwen3.5-plus": { inputUnitCost: 1, outputUnitCost: 4 },
  "glm-5.1": { inputUnitCost: 1, outputUnitCost: 4 },
  "gemini-3-flash-preview": { inputUnitCost: 1, outputUnitCost: 4 },
  "gemini-3.1-pro-preview": { inputUnitCost: 1, outputUnitCost: 4 },
  "gpt-5.5": { inputUnitCost: 1, outputUnitCost: 4 },
  "claude-sonnet-4-6": { inputUnitCost: 1, outputUnitCost: 4 },
} as const

export type ProModel = keyof typeof AI_MODEL_COEFFICIENTS

export const PRO_MODEL_WHITELIST = Object.keys(AI_MODEL_COEFFICIENTS) as readonly ProModel[]

export function isProModel(m: string): m is ProModel {
  return m in AI_MODEL_COEFFICIENTS
}

export function normalizeTokens(
  model: ProModel,
  tokens: { input: number; output: number },
): number {
  const coef = AI_MODEL_COEFFICIENTS[model]
  if (!coef) throw new Error(`normalizeTokens: unknown model '${model}'`)
  return Math.ceil(tokens.input * coef.inputUnitCost + tokens.output * coef.outputUnitCost)
}
