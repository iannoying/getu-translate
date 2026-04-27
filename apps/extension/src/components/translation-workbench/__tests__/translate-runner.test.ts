import type { TranslateProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { runTranslationWorkbenchRequest } from "../translate-runner"

const sendMessageMock = vi.hoisted(() => vi.fn())
const consumeQuotaMock = vi.hoisted(() => vi.fn())
const dispatchFreeTranslateMock = vi.hoisted(() => vi.fn())
const generateTextMock = vi.hoisted(() => vi.fn())
const getModelByIdMock = vi.hoisted(() => vi.fn())
const resolveModelIdMock = vi.hoisted(() => vi.fn())

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

vi.mock("@/utils/host/translate/api/dispatch", () => ({
  DEFAULT_ORDER: ["google", "microsoft", "bing", "yandex"],
  defaultHealth: {},
  defaultImpls: {},
  dispatchFreeTranslate: dispatchFreeTranslateMock,
}))

vi.mock("ai", () => ({
  generateText: generateTextMock,
}))

vi.mock("@/utils/providers/model", () => ({
  getModelById: getModelByIdMock,
}))

vi.mock("@/utils/providers/model-id", () => ({
  resolveModelId: resolveModelIdMock,
}))

vi.mock("@/utils/providers/options", () => ({
  getProviderOptionsWithOverride: vi.fn(() => ({})),
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

const uuidClickId = "01929b2e-7a94-7c9e-9f3a-8b4c5d6e7f80"

describe("runTranslationWorkbenchRequest", () => {
  beforeEach(() => {
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue("translated")
    consumeQuotaMock.mockReset()
    consumeQuotaMock.mockResolvedValue({
      bucket: "web_text_translate_monthly",
      remaining: 99,
      reset_at: null,
    })
    dispatchFreeTranslateMock.mockReset()
    dispatchFreeTranslateMock.mockResolvedValue({ text: "direct translated", usedProvider: "google" })
    generateTextMock.mockReset()
    generateTextMock.mockResolvedValue({ text: "direct translated" })
    getModelByIdMock.mockReset()
    getModelByIdMock.mockResolvedValue({ provider: "model" })
    resolveModelIdMock.mockReset()
    resolveModelIdMock.mockReturnValue("deepseek-v4-pro")
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

    expect(sendMessageMock).not.toHaveBeenCalled()
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

    expect(sendMessageMock).not.toHaveBeenCalled()
    expect(consumeQuotaMock).not.toHaveBeenCalled()
    expect(results).toEqual([
      { providerId: "getu-pro-default", status: "upgrade-required" },
    ])
  })

  it("does not consume GetU quota for signed-in free translation providers", async () => {
    await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: uuidClickId,
      },
      providers: [googleProvider],
      languageLevel: "intermediate",
    })

    expect(consumeQuotaMock).not.toHaveBeenCalled()
  })

  it("consumes one web text click quota for signed-in runnable GetU Pro requests", async () => {
    await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: uuidClickId,
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(consumeQuotaMock).toHaveBeenCalledWith({
      bucket: "web_text_translate_monthly",
      amount: 1,
      request_id: uuidClickId,
    })
  })

  it("sends runnable non-GetU provider calls to the background without headers", async () => {
    await runTranslationWorkbenchRequest({
      plan: "free",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-4",
      },
      providers: [googleProvider],
      languageLevel: "intermediate",
    })

    expect(sendMessageMock).toHaveBeenCalledWith(
      "executeTranslationWorkbenchRequest",
      {
        text: "hello",
        langConfig: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
        providerConfig: googleProvider,
      },
    )
    expect(consumeQuotaMock).not.toHaveBeenCalled()
  })

  it("uses separate token request headers for each GetU Pro provider background call", async () => {
    const secondProProvider = {
      ...proProvider,
      id: "getu-pro-backup",
      name: "DeepSeek-V4-Pro Backup",
    } as TranslateProviderConfig

    await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-5",
      },
      providers: [proProvider, secondProProvider],
      languageLevel: "intermediate",
    })

    expect(sendMessageMock).toHaveBeenNthCalledWith(
      1,
      "executeTranslationWorkbenchRequest",
      {
        text: "hello",
        langConfig: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
        providerConfig: proProvider,
        headers: {
          "x-request-id": "sidebar-web-text-token:click-5:getu-pro-default",
          "x-getu-quota-bucket": "web_text_translate_token_monthly",
        },
      },
    )
    expect(sendMessageMock).toHaveBeenNthCalledWith(
      2,
      "executeTranslationWorkbenchRequest",
      {
        text: "hello",
        langConfig: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
        providerConfig: secondProProvider,
        headers: {
          "x-request-id": "sidebar-web-text-token:click-5:getu-pro-backup",
          "x-getu-quota-bucket": "web_text_translate_token_monthly",
        },
      },
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
    expect(consumeQuotaMock).not.toHaveBeenCalled()
  })

  it("returns quota-exhausted results and skips GetU Pro providers when click quota is exhausted", async () => {
    consumeQuotaMock.mockRejectedValueOnce({ code: "QUOTA_EXCEEDED", message: "quota exhausted" })

    const results = await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-7",
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "getu-pro-default", status: "quota-exhausted", errorMessage: "quota exhausted" },
    ])
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("still runs free providers when a mixed GetU Pro click quota check fails", async () => {
    consumeQuotaMock.mockRejectedValueOnce({ code: "QUOTA_EXCEEDED", message: "quota exhausted" })

    const results = await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-mixed-quota",
      },
      providers: [googleProvider, proProvider],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "google-translate-default", status: "success", text: "translated" },
      { providerId: "getu-pro-default", status: "quota-exhausted", errorMessage: "quota exhausted" },
    ])
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledWith(
      "executeTranslationWorkbenchRequest",
      expect.objectContaining({ providerConfig: googleProvider }),
    )
  })

  it("returns quota-exhausted when a GetU Pro token request exhausts token quota", async () => {
    sendMessageMock.mockRejectedValueOnce(Object.assign(new Error("token quota exhausted"), {
      code: "QUOTA_EXCEEDED",
    }))

    const results = await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-token-quota",
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "getu-pro-default", status: "quota-exhausted", errorMessage: "token quota exhausted" },
    ])
  })

  it("returns error results and skips GetU Pro providers when click quota check fails for a non-quota error", async () => {
    consumeQuotaMock.mockRejectedValueOnce(new Error("network down"))

    const results = await runTranslationWorkbenchRequest({
      plan: "pro",
      userId: "user-1",
      request: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "cmn",
        clickId: "click-8",
      },
      providers: [proProvider],
      languageLevel: "intermediate",
    })

    expect(results).toEqual([
      { providerId: "getu-pro-default", status: "error", errorMessage: "network down" },
    ])
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("returns an error result for one failed provider without clearing successful results", async () => {
    sendMessageMock
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
