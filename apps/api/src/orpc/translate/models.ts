import { ORPCError } from "@orpc/server"
import {
  TRANSLATE_MODEL_BY_ID,
  isFreeTranslateModel,
  isTranslateModelId,
  type TranslateModelId,
} from "@getu/definitions"

export type Plan = "free" | "pro" | "enterprise"

/**
 * Throws if the user's plan can't access the requested model. Free users may
 * only invoke `google` and `microsoft`; Pro and Enterprise unlock all 11.
 *
 * Throws `BAD_REQUEST` for an unknown model id (defends against direct API
 * callers who haven't been through the front-end model picker).
 */
export function requireModelAccess(plan: Plan, modelId: string): TranslateModelId {
  if (!isTranslateModelId(modelId)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Unknown translate model: '${modelId}'`,
      data: { modelId },
    })
  }
  if (plan === "free" && !isFreeTranslateModel(modelId)) {
    throw new ORPCError("FORBIDDEN", {
      message: "Pro 会员专用模型，请升级 Pro",
      data: {
        code: "PRO_REQUIRED",
        modelId,
        modelDisplayName: TRANSLATE_MODEL_BY_ID[modelId].displayName,
      },
    })
  }
  return modelId
}
