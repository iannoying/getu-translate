/**
 * AI model cost coefficients, normalized to gpt-4o-mini input token = 1 unit.
 * Update ONLY when bianxie.ai pricing changes or we add a new whitelist entry.
 * Output cost is typically 3-4x input cost per the underlying provider pricing.
 */
export const AI_MODEL_COEFFICIENTS = {
  "gpt-4o-mini": { inputUnitCost: 1, outputUnitCost: 4 },
  // Claude 3.5 Sonnet: ~20x gpt-4o-mini input, ~25x output (bianxie.ai pricing as of 2026-04)
  "claude-3-5-sonnet-latest": { inputUnitCost: 20, outputUnitCost: 25 },
  // Gemini 2.0 Flash: close to gpt-4o-mini, slightly cheaper output
  "gemini-2.0-flash": { inputUnitCost: 1, outputUnitCost: 3 },
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
