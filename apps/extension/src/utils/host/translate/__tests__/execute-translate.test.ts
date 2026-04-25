import type { ProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "../execute-translate"

const dispatchFreeTranslateMock = vi.hoisted(() => vi.fn())

vi.mock("../api/dispatch", () => ({
  DEFAULT_ORDER: ["google", "microsoft", "bing", "yandex"],
  defaultHealth: {},
  defaultImpls: {},
  dispatchFreeTranslate: dispatchFreeTranslateMock,
}))

describe("executeTranslate", () => {
  beforeEach(() => {
    dispatchFreeTranslateMock.mockReset()
    dispatchFreeTranslateMock.mockResolvedValue({ text: "translated", usedProvider: "google" })
  })

  it("does not add LibreTranslate to the free translation fallback", async () => {
    const providerConfig = {
      id: "google-translate-default",
      name: "Google Translate",
      enabled: true,
      provider: "google-translate",
      endpoint: "https://libretranslate.com/translate",
    } as ProviderConfig

    await executeTranslate("Hello", DEFAULT_CONFIG.language, providerConfig, vi.fn())

    expect(dispatchFreeTranslateMock).toHaveBeenCalledWith(
      { text: "Hello", from: "auto", to: "zh" },
      expect.objectContaining({
        order: ["google", "microsoft", "bing", "yandex"],
        impls: expect.not.objectContaining({ libre: expect.any(Function) }),
      }),
    )
  })
})
