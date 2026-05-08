import {
  TRANSLATE_MODELS,
  isFreeTranslateModel,
  type TranslateModelId,
} from "@getu/definitions"
import type { Entitlements } from "@getu/contract"

export type TranslatePlan = "anonymous" | "loading" | "free" | "pro" | "enterprise"

export function resolveTranslatePlan({
  isAuthed,
  entitlements,
  entitlementsLoaded,
}: {
  isAuthed: boolean
  entitlements: Entitlements | null
  entitlementsLoaded: boolean
}): TranslatePlan {
  if (!isAuthed) return "anonymous"
  if (entitlements) return entitlements.tier
  return entitlementsLoaded ? "free" : "loading"
}

export function getInvokableModels(plan: TranslatePlan): TranslateModelId[] {
  if (plan === "free") {
    return TRANSLATE_MODELS.filter(m => isFreeTranslateModel(m.id)).map(m => m.id)
  }
  if (plan === "pro" || plan === "enterprise") {
    return TRANSLATE_MODELS.map(m => m.id)
  }
  return []
}

export function shouldDisableTranslate({
  isAuthed,
  plan,
  text,
  overLimit,
  isTranslating,
}: {
  isAuthed: boolean
  plan: TranslatePlan
  text: string
  overLimit: boolean
  isTranslating: boolean
}): boolean {
  return overLimit || isTranslating || plan === "loading" || (isAuthed && text.trim().length === 0)
}
