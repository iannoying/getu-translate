// @vitest-environment jsdom
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { atom, createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { SidebarTextTab } from "../sidebar-text-tab"

const sendMessageMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const sessionRefetchMock = vi.hoisted(() => vi.fn(async () => undefined))
const useSessionMock = vi.hoisted(() => vi.fn())
const useEntitlementsMock = vi.hoisted(() => vi.fn())
const runTranslationWorkbenchRequestMock = vi.hoisted(() => vi.fn())
const providersConfigMock = vi.hoisted(() => vi.fn())

const SIDEBAR_SELECTED_PROVIDERS_DRIVER_KEY = "getu:side-content:selected-providers"

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      getURL: (path = "") => `chrome-extension://test${path}`,
    },
    tabs: { create: vi.fn() },
  },
}))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

vi.mock("@/utils/constants/url", () => ({
  WEBSITE_URL: "https://getutranslate.com",
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    "getu-pro": { logo: () => "/getu-pro.svg", name: "GetU Pro", website: "" },
    "deepseek": { logo: () => "/deepseek.svg", name: "DeepSeek", website: "" },
    "google-translate": { logo: () => "/google.svg", name: "Google Translate", website: "" },
    "microsoft-translate": { logo: () => "/microsoft.svg", name: "Microsoft Translate", website: "" },
    "alibaba": { logo: () => "/alibaba.svg", name: "Alibaba", website: "" },
  },
}))

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    language: atom({ sourceCode: "auto", targetCode: "cmn", level: "intermediate" }),
    providersConfig: atom(() => providersConfigMock()),
  },
}))

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
  },
}))

vi.mock("@/hooks/use-entitlements", () => ({
  useEntitlements: (userId: string | null) => useEntitlementsMock(userId),
}))

vi.mock("@/components/translation-workbench/language-picker", () => ({
  WorkbenchLanguagePicker: ({
    onTargetChange,
    portalContainer,
  }: {
    onTargetChange: (targetCode: "jpn") => void
    portalContainer: HTMLElement
  }) => (
    <div data-testid="language-picker" data-portal-container={portalContainer.id || "body"}>
      <button type="button" onClick={() => onTargetChange("jpn")}>set target jpn</button>
    </div>
  ),
}))

vi.mock("@/components/translation-workbench/result-card", () => ({
  TranslationWorkbenchResultCard: ({
    provider,
    result,
    speechLanguage,
    onLogin,
    onUpgrade,
  }: {
    provider: { name: string }
    result: { status: string, text?: string }
    speechLanguage?: string
    onLogin: () => void
    onUpgrade: () => void
  }) => (
    <div
      data-testid="translation-result-card"
      data-status={result.status}
      data-speech-language={speechLanguage}
    >
      <span>{provider.name}</span>
      {result.text && <span>{result.text}</span>}
      <button type="button" onClick={onLogin}>login</button>
      <button type="button" onClick={onUpgrade}>upgrade</button>
    </div>
  ),
}))

vi.mock("@/components/translation-workbench/translate-runner", () => ({
  runTranslationWorkbenchRequest: runTranslationWorkbenchRequestMock,
}))

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

function renderSidebarTextTab(portalContainer?: HTMLElement | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue()
  const store = createStore()

  return {
    ...render(
      <JotaiProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <SidebarTextTab portalContainer={portalContainer} />
        </QueryClientProvider>
      </JotaiProvider>,
    ),
    invalidateSpy,
  }
}

describe("sidebarTextTab", () => {
  beforeEach(() => {
    fakeBrowser.reset()
    sendMessageMock.mockClear()
    sessionRefetchMock.mockClear()
    useSessionMock.mockReset()
    useSessionMock.mockReturnValue({ data: null, isPending: false, refetch: sessionRefetchMock })
    useEntitlementsMock.mockReset()
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    providersConfigMock.mockReset()
    providersConfigMock.mockReturnValue([
      {
        id: "getu-pro",
        name: "GetU Pro",
        provider: "getu-pro",
        enabled: true,
        apiKey: "test",
        model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
      },
    ])
    runTranslationWorkbenchRequestMock.mockReset()
    runTranslationWorkbenchRequestMock.mockResolvedValue([
      { providerId: "getu-pro", status: "success", text: "translated" },
    ])
  })

  it("opens login and upgrade links through background messaging", () => {
    renderSidebarTextTab()

    fireEvent.click(screen.getByRole("button", { name: "login" }))
    fireEvent.click(screen.getByRole("button", { name: "upgrade" }))

    expect(sendMessageMock).toHaveBeenCalledWith("openPage", { url: "https://getutranslate.com/log-in?redirect=/" })
    expect(sendMessageMock).toHaveBeenCalledWith("openPage", { url: "https://getutranslate.com/pricing" })
  })

  it("refetches the better-auth session when the visible sidebar regains focus", async () => {
    const { invalidateSpy } = renderSidebarTextTab()

    window.dispatchEvent(new Event("focus"))

    await vi.waitFor(() => {
      expect(sessionRefetchMock).toHaveBeenCalledTimes(1)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entitlements"] })
    })
  })

  it("waits for Pro entitlements before continuing the same sidebar translate click", async () => {
    let entitlementsState: { data: Entitlements, isLoading: boolean, isFromCache: boolean } = {
      data: FREE_ENTITLEMENTS,
      isLoading: true,
      isFromCache: false,
    }
    useSessionMock.mockReturnValue({
      data: { user: { id: "user-pro" } },
      isPending: false,
      refetch: sessionRefetchMock,
    })
    useEntitlementsMock.mockImplementation(() => entitlementsState)

    const { rerender } = renderSidebarTextTab()

    fireEvent.change(screen.getByPlaceholderText("translationWorkbench.inputPlaceholder"), {
      target: { value: "你好呀" },
    })
    fireEvent.click(screen.getByRole("button", { name: /translationWorkbench\.translate/ }))

    await Promise.resolve()
    await Promise.resolve()

    expect(runTranslationWorkbenchRequestMock).not.toHaveBeenCalled()

    entitlementsState = {
      data: PRO_ENTITLEMENTS,
      isLoading: false,
      isFromCache: false,
    }
    rerender(
      <JotaiProvider store={createStore()}>
        <QueryClientProvider client={new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })}
        >
          <SidebarTextTab />
        </QueryClientProvider>
      </JotaiProvider>,
    )

    await waitFor(() => {
      expect(runTranslationWorkbenchRequestMock).toHaveBeenCalledTimes(1)
    })
    expect(runTranslationWorkbenchRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "pro",
        userId: "user-pro",
        request: expect.objectContaining({
          text: "你好呀",
          clickId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        }),
      }),
    )
  })

  it("defaults the sidebar candidate to Gemini 3 Flash", () => {
    providersConfigMock.mockReturnValue([
      {
        id: "google",
        name: "Google Translate",
        provider: "google-translate",
        enabled: true,
      },
      {
        id: "getu-pro-gemini-3-flash-preview",
        name: "Gemini-3-flash",
        provider: "getu-pro",
        enabled: true,
        apiKey: "test",
        model: { model: "gemini-3-flash-preview", isCustomModel: false, customModel: null },
      },
      {
        id: "getu-pro-default",
        name: "DeepSeek-V4-Pro",
        provider: "getu-pro",
        enabled: true,
        apiKey: "test",
        model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
      },
    ])

    renderSidebarTextTab()

    const resultCards = screen.getAllByTestId("translation-result-card")
    expect(resultCards).toHaveLength(1)
    expect(within(resultCards[0]).getByText("Gemini-3-flash")).toBeInTheDocument()
  })

  it("passes the configured target language to translation result speech controls", () => {
    renderSidebarTextTab()

    const resultCards = screen.getAllByTestId("translation-result-card")
    expect(resultCards).toHaveLength(1)
    expect(resultCards[0]).toHaveAttribute("data-speech-language", "cmn")
  })

  it("passes a provided portal container to child controls", () => {
    const portalContainer = document.createElement("div")
    portalContainer.id = "sidebar-portal"
    document.body.appendChild(portalContainer)

    renderSidebarTextTab(portalContainer)

    expect(screen.getByTestId("language-picker")).toHaveAttribute("data-portal-container", "sidebar-portal")
  })

  it("keeps completed result speech language after the target picker changes", async () => {
    renderSidebarTextTab()

    fireEvent.change(screen.getByPlaceholderText("translationWorkbench.inputPlaceholder"), {
      target: { value: "你好呀" },
    })
    fireEvent.click(screen.getByRole("button", { name: /translationWorkbench\.translate/ }))

    await waitFor(() => {
      expect(screen.getByText("translated")).toBeInTheDocument()
    })

    const [resultCard] = screen.getAllByTestId("translation-result-card")
    expect(resultCard).toHaveAttribute("data-speech-language", "cmn")

    fireEvent.click(screen.getByRole("button", { name: "set target jpn" }))

    expect(screen.getAllByTestId("translation-result-card")[0]).toHaveAttribute("data-speech-language", "cmn")
  })

  it("keeps selected free providers before paid providers and persists the choice", async () => {
    providersConfigMock.mockReturnValue([
      {
        id: "getu-pro-gemini-3-flash-preview",
        name: "Gemini-3-flash",
        provider: "getu-pro",
        enabled: true,
        apiKey: "test",
        model: { model: "gemini-3-flash-preview", isCustomModel: false, customModel: null },
      },
      {
        id: "google",
        name: "Google Translate",
        provider: "google-translate",
        enabled: true,
      },
      {
        id: "microsoft",
        name: "Microsoft Translate",
        provider: "microsoft-translate",
        enabled: true,
      },
      {
        id: "getu-pro-default",
        name: "DeepSeek-V4-Pro",
        provider: "getu-pro",
        enabled: true,
        apiKey: "test",
        model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
      },
    ])

    const rendered = renderSidebarTextTab()

    let resultCards = screen.getAllByTestId("translation-result-card")
    expect(resultCards).toHaveLength(1)
    expect(within(resultCards[0]).getByText("Gemini-3-flash")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.selectProviders" }))
    fireEvent.click(screen.getByRole("checkbox", { name: /Google Translate/ }))

    resultCards = screen.getAllByTestId("translation-result-card")
    expect(resultCards).toHaveLength(2)
    expect(within(resultCards[0]).getByText("Google Translate")).toBeInTheDocument()
    expect(within(resultCards[1]).getByText("Gemini-3-flash")).toBeInTheDocument()

    await waitFor(async () => {
      const stored = await fakeBrowser.storage.local.get(SIDEBAR_SELECTED_PROVIDERS_DRIVER_KEY)
      expect(stored[SIDEBAR_SELECTED_PROVIDERS_DRIVER_KEY]).toEqual(["google", "getu-pro-gemini-3-flash-preview"])
    })

    rendered.unmount()
    renderSidebarTextTab()

    await waitFor(() => {
      const reopenedCards = screen.getAllByTestId("translation-result-card")
      expect(reopenedCards).toHaveLength(2)
      expect(within(reopenedCards[0]).getByText("Google Translate")).toBeInTheDocument()
      expect(within(reopenedCards[1]).getByText("Gemini-3-flash")).toBeInTheDocument()
    })
  })

  it("hydrates the last selected sidebar providers from storage", async () => {
    await fakeBrowser.storage.local.set({
      [SIDEBAR_SELECTED_PROVIDERS_DRIVER_KEY]: ["microsoft", "getu-pro-gemini-3-flash-preview"],
    })
    providersConfigMock.mockReturnValue([
      {
        id: "getu-pro-gemini-3-flash-preview",
        name: "Gemini-3-flash",
        provider: "getu-pro",
        enabled: true,
        apiKey: "test",
        model: { model: "gemini-3-flash-preview", isCustomModel: false, customModel: null },
      },
      {
        id: "google",
        name: "Google Translate",
        provider: "google-translate",
        enabled: true,
      },
      {
        id: "microsoft",
        name: "Microsoft Translate",
        provider: "microsoft-translate",
        enabled: true,
      },
    ])

    renderSidebarTextTab()

    await waitFor(() => {
      const resultCards = screen.getAllByTestId("translation-result-card")
      expect(resultCards).toHaveLength(2)
      expect(within(resultCards[0]).getByText("Microsoft Translate")).toBeInTheDocument()
      expect(within(resultCards[1]).getByText("Gemini-3-flash")).toBeInTheDocument()
    })
  })
})
