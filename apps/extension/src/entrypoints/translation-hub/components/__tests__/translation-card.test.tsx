// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { translateRequestAtom } from "../../atoms"
import { TranslationCard } from "../translation-card"

const executeTranslateMock = vi.hoisted(() => vi.fn())
const providersConfig = vi.hoisted(() => [
  {
    id: "getu-pro-default",
    name: "DeepSeek-V4-Pro",
    enabled: true,
    provider: "getu-pro",
    model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
  },
  {
    id: "google-translate-default",
    name: "Google Translate",
    enabled: true,
    provider: "google-translate",
  },
])

vi.mock("@/utils/host/translate/execute-translate", () => ({
  executeTranslate: executeTranslateMock,
}))

vi.mock("@/utils/prompts/translate", () => ({
  getTranslatePrompt: vi.fn(),
}))

vi.mock("@/utils/analytics", () => ({
  createFeatureUsageContext: vi.fn(() => ({})),
  trackFeatureAttempt: async (_context: unknown, run: () => Promise<unknown>) => run(),
}))

vi.mock("@/utils/atoms/config", async () => {
  const { atom } = await vi.importActual<typeof import("jotai")>("jotai")
  return {
    configFieldsAtomMap: {
      language: atom({ sourceCode: "auto", targetCode: "cmn", level: "intermediate" }),
      providersConfig: atom(providersConfig),
    },
  }
})

vi.mock("@/components/provider-icon", () => ({
  default: ({ name }: { name?: string }) => <span data-testid="provider-icon">{name}</span>,
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    "getu-pro": { logo: () => "getu.svg", name: "GetU Pro", website: "https://getutranslate.com" },
    "google-translate": { logo: () => "google.svg", name: "Google Translate", website: "https://translate.google.com" },
  },
}))

function renderTranslationCard(providerId: string, clickId = "click-1") {
  const store = createStore()
  store.set(translateRequestAtom, {
    inputText: "hello",
    sourceLanguage: "auto",
    targetLanguage: "cmn",
    timestamp: 1000,
    clickId,
  })

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <JotaiProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <TranslationCard
          providerId={providerId}
          isExpanded
          onExpandedChange={vi.fn()}
        />
      </QueryClientProvider>
    </JotaiProvider>,
  )
}

describe("translation hub TranslationCard", () => {
  beforeEach(() => {
    executeTranslateMock.mockReset()
    executeTranslateMock.mockResolvedValue("translated")
  })

  it("passes web text token accounting headers for GetU Pro providers", async () => {
    const proProvider = providersConfig[0] as TranslateProviderConfig

    renderTranslationCard(proProvider.id, "click-pro")

    await waitFor(() => {
      expect(executeTranslateMock).toHaveBeenCalledTimes(1)
    })

    expect(executeTranslateMock).toHaveBeenCalledWith(
      "hello",
      { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
      proProvider,
      expect.any(Function),
      {
        headers: {
          "x-request-id": "sidebar-web-text-token:click-pro:getu-pro-default",
          "x-getu-quota-bucket": "web_text_translate_token_monthly",
        },
      },
    )
  })

  it("keeps non-GetU Pro provider calls free of token accounting headers", async () => {
    const googleProvider = providersConfig[1] as TranslateProviderConfig

    renderTranslationCard(googleProvider.id, "click-google")

    await waitFor(() => {
      expect(executeTranslateMock).toHaveBeenCalledTimes(1)
    })

    expect(executeTranslateMock.mock.calls[0]).toHaveLength(4)
    expect(executeTranslateMock).toHaveBeenCalledWith(
      "hello",
      { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
      googleProvider,
      expect.any(Function),
    )
  })
})
