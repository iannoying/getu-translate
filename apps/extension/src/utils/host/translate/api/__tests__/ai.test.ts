import type { LLMProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { aiTranslate } from "../ai"

const generateTextMock = vi.hoisted(() => vi.fn(async () => ({ text: "translated" })))
const getModelByIdMock = vi.hoisted(() => vi.fn(async () => ({ provider: "model" })))
const resolveModelIdMock = vi.hoisted(() => vi.fn(() => "deepseek-v4-pro"))
const promptResolverMock = vi.hoisted(() => vi.fn(async () => ({
  systemPrompt: "translate",
  prompt: "hello",
})))

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

describe("aiTranslate", () => {
  beforeEach(() => {
    generateTextMock.mockClear()
    getModelByIdMock.mockClear()
    resolveModelIdMock.mockClear()
    promptResolverMock.mockClear()
  })

  it("passes per-call headers to generateText", async () => {
    const providerConfig = {
      id: "getu-pro-default",
      name: "DeepSeek-V4-Pro",
      enabled: true,
      provider: "getu-pro",
      model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
    } as LLMProviderConfig

    await aiTranslate("hello", "Chinese", providerConfig, promptResolverMock, {
      headers: {
        "x-request-id": "sidebar-token-1",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
    })

    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      headers: {
        "x-request-id": "sidebar-token-1",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
    }))
    expect(getModelByIdMock).toHaveBeenCalledWith("getu-pro-default", {
      quotaBucket: "web_text_translate_token_monthly",
    })
  })

  it("preserves quota error codes from AI SDK failures", async () => {
    const providerConfig = {
      id: "getu-pro-default",
      name: "DeepSeek-V4-Pro",
      enabled: true,
      provider: "getu-pro",
      model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
    } as LLMProviderConfig
    generateTextMock.mockRejectedValueOnce(Object.assign(new Error("HTTP 429"), {
      statusCode: 429,
      responseBody: JSON.stringify({
        code: "QUOTA_EXCEEDED",
        error: "Bucket web_text_translate_token_monthly exceeded",
      }),
    }))

    await expect(aiTranslate("hello", "Chinese", providerConfig, promptResolverMock, {
      headers: {
        "x-request-id": "sidebar-token-2",
        "x-getu-quota-bucket": "web_text_translate_token_monthly",
      },
    })).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      message: "Bucket web_text_translate_token_monthly exceeded",
    })
  })
})
