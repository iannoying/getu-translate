import type { ProviderGate, TranslationWorkbenchPlan } from "./types"
import type { TranslateProviderConfig } from "@/types/config/provider"
import type { Entitlements } from "@/types/entitlements"
import { isPro } from "@/types/entitlements"

const TEXT_TRANSLATE_CHAR_LIMITS: Record<TranslationWorkbenchPlan, number> = {
  anonymous: 2000,
  free: 2000,
  pro: 20000,
  enterprise: 20000,
}

export function planFromEntitlements(userId: string | null, entitlements: Entitlements): TranslationWorkbenchPlan {
  if (userId === null)
    return "anonymous"
  if (entitlements.tier === "enterprise" && isPro(entitlements))
    return "enterprise"
  if (entitlements.tier === "pro" && isPro(entitlements))
    return "pro"
  return "free"
}

export function getTextTranslateCharLimit(plan: TranslationWorkbenchPlan): number {
  return TEXT_TRANSLATE_CHAR_LIMITS[plan]
}

export function isGetuProProvider(provider: TranslateProviderConfig): boolean {
  return provider.provider === "getu-pro"
}

export function getProviderGate(provider: TranslateProviderConfig, plan: TranslationWorkbenchPlan): ProviderGate {
  if (plan === "anonymous")
    return "login-required"
  if (!isGetuProProvider(provider))
    return "available"
  if (plan === "free")
    return "upgrade-required"
  return "available"
}

export function buildSidebarClickRequestId(clickId: string): string {
  return clickId
}

export function buildSidebarTokenRequestId(clickId: string, providerId: string): string {
  return `sidebar-web-text-token:${clickId}:${providerId}`
}
