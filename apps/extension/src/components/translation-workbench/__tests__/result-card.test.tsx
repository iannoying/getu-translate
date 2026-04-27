// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TranslationWorkbenchResultCard } from "../result-card"

const toastSuccessMock = vi.hoisted(() => vi.fn())
const toastErrorMock = vi.hoisted(() => vi.fn())
const ttsConfigMock = vi.hoisted(() => ({
  defaultVoice: "en-US-AvaNeural",
  languageVoices: {},
  rate: 0,
  pitch: 0,
  volume: 0,
}))
const ttsPlayMock = vi.hoisted(() => vi.fn(async () => undefined))
const ttsStopMock = vi.hoisted(() => vi.fn())

vi.mock("@/components/provider-icon", () => ({
  default: ({ name }: { name?: string }) => <span data-testid="provider-icon">{name}</span>,
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    "getu-pro": { logo: () => "logo.svg", name: "GetU Pro", website: "https://getutranslate.com" },
    "google-translate": { logo: () => "logo.svg", name: "Google Translate", website: "https://translate.google.com" },
  },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    tts: "tts-atom",
  },
}))

vi.mock("jotai", () => ({
  useAtomValue: vi.fn(() => ttsConfigMock),
}))

vi.mock("@/hooks/use-text-to-speech", () => ({
  useTextToSpeech: vi.fn(() => ({
    play: ttsPlayMock,
    stop: ttsStopMock,
    isFetching: false,
    isPlaying: false,
  })),
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

const provider = {
  id: "getu-pro-default",
  name: "DeepSeek-V4-Pro",
  enabled: true,
  provider: "getu-pro",
} as TranslateProviderConfig

describe("translation workbench result card", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    ttsPlayMock.mockClear()
    ttsStopMock.mockClear()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    })
  })

  it("renders login-required state with login action", () => {
    const onLogin = vi.fn()
    render(
      <TranslationWorkbenchResultCard
        provider={provider}
        result={{ providerId: provider.id, status: "login-required" }}
        onRetry={vi.fn()}
        onLogin={onLogin}
        onUpgrade={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.loginAction" }))

    expect(onLogin).toHaveBeenCalledTimes(1)
  })

  it("renders successful text and copy action", async () => {
    render(
      <TranslationWorkbenchResultCard
        provider={provider}
        result={{ providerId: provider.id, status: "success", text: "你好" }}
        onRetry={vi.fn()}
        onLogin={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    )

    expect(screen.getByText("你好")).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText("translationWorkbench.copyResult"))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("你好")
    })
    expect(toastSuccessMock).toHaveBeenCalledWith("translationWorkbench.copied")
  })

  it("shows copy failure feedback when clipboard write rejects", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    })

    render(
      <TranslationWorkbenchResultCard
        provider={provider}
        result={{ providerId: provider.id, status: "success", text: "你好" }}
        onRetry={vi.fn()}
        onLogin={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText("translationWorkbench.copyResult"))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("translationWorkbench.copyFailed")
    })
  })

  it("plays successful translation text through TTS", async () => {
    render(
      <TranslationWorkbenchResultCard
        provider={provider}
        result={{ providerId: provider.id, status: "success", text: "你好" }}
        onRetry={vi.fn()}
        onLogin={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText("action.speak"))

    await waitFor(() => {
      expect(ttsPlayMock).toHaveBeenCalledWith("你好", ttsConfigMock)
    })
  })

  it("plays successful translation text through TTS with a target language", async () => {
    render(
      <TranslationWorkbenchResultCard
        provider={provider}
        result={{ providerId: provider.id, status: "success", text: "你好" }}
        speechLanguage="cmn"
        onRetry={vi.fn()}
        onLogin={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText("action.speak"))

    await waitFor(() => {
      expect(ttsPlayMock).toHaveBeenCalledWith("你好", ttsConfigMock, { language: "cmn" })
    })
  })
})
