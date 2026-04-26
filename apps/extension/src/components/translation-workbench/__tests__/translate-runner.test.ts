import type { TranslateProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { runTranslationWorkbenchRequest } from "../translate-runner"

const executeTranslateMock = vi.hoisted(() => vi.fn())
const consumeQuotaMock = vi.hoisted(() => vi.fn())

vi.mock("@/utils/host/translate/execute-translate", () => ({
  executeTranslate: executeTranslateMock,
}))

vi.mock("@/utils/prompts/translate", () => ({
  getTranslatePrompt: vi.fn(),
}))

vi.mock("@/utils/orpc/client", () => ({
  orpcClient: {
    billing: {
      consumeQuota: consumeQuotaMock,
    },
  },
}))

const googleProvider = {
  id: "google-translate-default",
  name: "Google Translate",
  enabled: true,
  provider: "google-translate",
} as TranslateProviderConfig

const proProvider = {
  id: "getu-pro-default",
  name: "DeepSeek-V4-Pro",
  enabled: true,
  provider: "getu-pro",
  model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
} as TranslateProviderConfig

describe("runTranslationWorkbenchRequest", () => {
  beforeEach(() => {
    executeTranslateMock.mockReset()
    executeTranslateMock.mockResolvedValue("translated")
    consumeQuotaMock.mockReset()
    consumeQuotaMock.mockResolvedValue({
      bucket: "web_text_translate_monthly",
      remaining: 99,
      reset_at: null,
    })
  })

  it("does not call any provider for anonymous users", async () => {
    const results = await runTranslationWorkbenchRequest({
      plan: "anonymous",
      userId: null,
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-1",
      },
      providers: [googleProvider, proProvider],
      languageLevel: "intermediate",
    })

    expect(executeTranslateMock).not.toHaveBeenCalled()
    expect(consumeQuotaMock).not.toHaveBeenCalled()
    expect(results).toEqual([
      { providerId: "google-translate-default", status: "login-required" },
      { providerId: "getu-pro-default", status: "login-required" },
    ])
  })

  it("does not call gated Pro providers for logged-in free users", async () => {
    const results = await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-2",
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(executeTranslateMock).not.toHaveBeenCalled()
    expect(consumeQuotaMock).not.toHaveBeenCalled()
    expect(results).toEqual([
      { providerId: "getu-pro-default", status: "upgrade-required" },
    ])
  })

  it("consumes one web text click quota for signed-in runnable requests", async () => {
    await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-3",
      },
      providers: [googleProvider],
      languageLevel: "intermediate",
    })

    expect(consumeQuotaMock).toHaveBeenCalledWith({
      bucket: "web_text_translate_monthly",
      amount: 1,
      request_id: "sidebar-web-text:click-3",
    })
  })

  it("uses a separate token request id for each GetU Pro provider call", async () => {
    await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-4",
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(executeTranslateMock).toHaveBeenCalledWith(
      "hello",
      { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
      proProvider,
      expect.any(Function),
      expect.objectContaining({
        headers: {
          "x-request-id": "sidebar-web-text-token:click-4:getu-pro-default",
          "x-getu-quota-bucket": "web_text_translate_token_monthly",
        },
      }),
    )
  })

  it("returns results in input provider order when gated and runnable providers are mixed", async () => {
    const results = await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-6",
      },
      providers: [googleProvider, proProvider],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "google-translate-default", status: "success", text: "translated" },
      { providerId: "getu-pro-default", status: "upgrade-required" },
    ])
  })

  it("returns quota-exhausted results and skips providers when click quota is exhausted", async () => {
    consumeQuotaMock.mockRejectedValueOnce({ code: "QUOTA_EXCEEDED", message: "quota exhausted" })

    const results = await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-7",
      },
      providers: [googleProvider],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "google-translate-default", status: "quota-exhausted", errorMessage: "quota exhausted" },
    ])
    expect(executeTranslateMock).not.toHaveBeenCalled()
  })

  it("returns error results and skips providers when click quota check fails for a non-quota error", async () => {
    consumeQuotaMock.mockRejectedValueOnce(new Error("network down"))

    const results = await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-8",
      },
      providers: [googleProvider],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "google-translate-default", status: "error", errorMessage: "network down" },
    ])
    expect(executeTranslateMock).not.toHaveBeenCalled()
  })

  it("returns an error result for one failed provider without clearing successful results", async () => {
    executeTranslateMock
      .mockResolvedValueOnce("first ok")
      .mockRejectedValueOnce(new Error("network failed"))

    const results = await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-5",
      },
      providers: [
        googleProvider,
        { ...googleProvider, id: "microsoft-translate-default", name: "Microsoft Translate", provider: "microsoft-translate" } as TranslateProviderConfig,
      ],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "google-translate-default", status: "success", text: "first ok" },
      { providerId: "microsoft-translate-default", status: "error", errorMessage: "network failed" },
    ])
  })
})
