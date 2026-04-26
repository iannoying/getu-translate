// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { translateRequestAtom } from "../../atoms"
import { TranslationCard } from "../translation-card"

const executeTranslateMock = vi.hoisted(() => vi.fn())
const useSessionMock = vi.hoisted(() => vi.fn())
const useEntitlementsMock = vi.hoisted(() => vi.fn())
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

const FREE_ENTITLEMENTS: Entitlements = {
  tier: "free",
  features: [],
  quota: {},
  expiresAt: null,
  graceUntil: null,
  billingEnabled: false,
  billingProvider: null,
}

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["web_text_translate_pro"],
  quota: {},
  expiresAt: "2999-01-01T00:00:00.000Z",
  graceUntil: null,
  billingEnabled: true,
  billingProvider: "paddle",
}

vi.mock("@/utils/host/translate/execute-translate", () => ({
  executeTranslate: executeTranslateMock,
}))

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
  },
}))

vi.mock("@/hooks/use-entitlements", () => ({
  useEntitlements: (userId: string | null) => useEntitlementsMock(userId),
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

function setAnonymousUser() {
  useSessionMock.mockReturnValue({ data: null, isPending: false })
  useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
}

function setFreeUser() {
  useSessionMock.mockReturnValue({ data: { user: { id: "user-free" } }, isPending: false })
  useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
}

function setProUser() {
  useSessionMock.mockReturnValue({ data: { user: { id: "user-pro" } }, isPending: false })
  useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })
}

describe("translation hub TranslationCard", () => {
  beforeEach(() => {
    executeTranslateMock.mockReset()
    executeTranslateMock.mockResolvedValue("translated")
    useSessionMock.mockReset()
    useEntitlementsMock.mockReset()
    setProUser()
  })

  it("does not call GetU Pro providers for anonymous users and shows login-required", async () => {
    setAnonymousUser()
    const proProvider = providersConfig[0] as TranslateProviderConfig

    renderTranslationCard(proProvider.id, "click-anon")

    await waitFor(() => {
      expect(screen.getByText("translationWorkbench.loginRequired")).toBeInTheDocument()
    })
    expect(executeTranslateMock).not.toHaveBeenCalled()
    expect(useEntitlementsMock).toHaveBeenCalledWith(null)
  })

  it("does not call GetU Pro providers for logged-in free users and shows upgrade-required", async () => {
    setFreeUser()
    const proProvider = providersConfig[0] as TranslateProviderConfig

    renderTranslationCard(proProvider.id, "click-free")

    await waitFor(() => {
      expect(screen.getByText("translationWorkbench.upgradeRequired")).toBeInTheDocument()
    })
    expect(executeTranslateMock).not.toHaveBeenCalled()
    expect(useEntitlementsMock).toHaveBeenCalledWith("user-free")
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
    setAnonymousUser()
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
