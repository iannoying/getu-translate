import type { LangCodeISO6393 } from "@getu/definitions"
import type { TranslateProviderConfig } from "@/types/config/provider"

export type TranslationWorkbenchPlan = "anonymous" | "free" | "pro" | "enterprise"

export type ProviderGate = "available" | "login-required" | "upgrade-required"

export type TranslationResultStatus
  = | "idle"
    | "loading"
    | "success"
    | "error"
    | "login-required"
    | "upgrade-required"
    | "quota-exhausted"

export interface TranslationResultState {
  providerId: string
  status: TranslationResultStatus
  text?: string
  errorMessage?: string
  speechLanguage?: LangCodeISO6393
}

export interface TranslationRequestSnapshot {
  text: string
  sourceLanguage: LangCodeISO6393 | "auto"
  targetLanguage: LangCodeISO6393
  clickId: string
}

export interface TranslationProviderRun {
  provider: TranslateProviderConfig
  gate: ProviderGate
}
