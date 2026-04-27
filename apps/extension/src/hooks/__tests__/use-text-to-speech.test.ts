import type { ReactNode } from "react"
// @vitest-environment jsdom
import type { TTSConfig } from "@/types/config/tts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { createElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { selectTTSVoice, useTextToSpeech } from "../use-text-to-speech"

const sendMessageMock = vi.fn()
const detectLanguageMock = vi.fn()

vi.mock("@/utils/message", () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}))

vi.mock("@/utils/content/language", () => ({
  detectLanguage: (...args: unknown[]) => detectLanguageMock(...args),
}))

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: () => "tts-request-1",
}))

const baseTtsConfig = {
  defaultVoice: "en-US-DavisNeural",
  languageVoices: {
    eng: "en-US-DavisNeural",
    jpn: "ja-JP-KeitaNeural",
    cmn: "zh-CN-YunxiNeural",
  },
  rate: 0,
  pitch: 0,
  volume: 0,
} as TTSConfig

function renderWithProviders<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const store = createStore()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      JotaiProvider,
      { store },
      createElement(QueryClientProvider, { client }, children),
    )

  return renderHook(hook, { wrapper })
}

describe("useTextToSpeech", () => {
  beforeEach(() => {
    sendMessageMock.mockReset()
    detectLanguageMock.mockReset()
    detectLanguageMock.mockResolvedValue("eng")
    sendMessageMock.mockImplementation(async (type: string) => {
      if (type === "edgeTtsSynthesize") {
        return {
          ok: true,
          audioBase64: "audio",
          contentType: "audio/mpeg",
        }
      }

      if (type === "ttsPlaybackStart") {
        return { ok: true }
      }

      return undefined
    })
  })

  it("uses the explicit target language voice when source text would detect as English", async () => {
    const { result } = renderWithProviders(() => useTextToSpeech())

    await act(async () => {
      await result.current.play("This sentence reads like English source text.", baseTtsConfig, { language: "cmn" })
    })

    expect(detectLanguageMock).not.toHaveBeenCalled()
    expect(sendMessageMock).toHaveBeenCalledWith("edgeTtsSynthesize", expect.objectContaining({
      text: "This sentence reads like English source text.",
      voice: "zh-CN-YunxiNeural",
    }))
    expect(sendMessageMock).not.toHaveBeenCalledWith("edgeTtsSynthesize", expect.objectContaining({
      voice: "en-US-DavisNeural",
    }))
  })
})

describe("selectTTSVoice", () => {
  it("prefers a forced preview voice over language detection", () => {
    expect(selectTTSVoice(baseTtsConfig, "eng", "ja-JP-KeitaNeural")).toBe("ja-JP-KeitaNeural")
  })

  it("uses the detected language voice when present", () => {
    expect(selectTTSVoice(baseTtsConfig, "jpn")).toBe("ja-JP-KeitaNeural")
  })

  it("uses an explicit translation target language before defaulting", () => {
    expect(selectTTSVoice(baseTtsConfig, "cmn")).toBe("zh-CN-YunxiNeural")
  })

  it("falls back to the default voice when there is no language match", () => {
    expect(selectTTSVoice(baseTtsConfig, "fra")).toBe("en-US-DavisNeural")
    expect(selectTTSVoice(baseTtsConfig, null)).toBe("en-US-DavisNeural")
  })
})
