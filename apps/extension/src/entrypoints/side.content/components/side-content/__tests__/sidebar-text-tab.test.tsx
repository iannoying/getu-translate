// @vitest-environment jsdom
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { atom, createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarTextTab } from "../sidebar-text-tab"

const sendMessageMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const sessionRefetchMock = vi.hoisted(() => vi.fn(async () => undefined))
const useSessionMock = vi.hoisted(() => vi.fn())
const useEntitlementsMock = vi.hoisted(() => vi.fn())
const runTranslationWorkbenchRequestMock = vi.hoisted(() => vi.fn())
const providersConfigMock = vi.hoisted(() => vi.fn())

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

vi.mock("../../../index", () => ({
  shadowWrapper: document.body,
}))

vi.mock("@/components/translation-workbench/language-picker", () => ({
  WorkbenchLanguagePicker: () => <div data-testid="language-picker" />,
}))

vi.mock("@/components/translation-workbench/result-card", () => ({
  TranslationWorkbenchResultCard: ({
    provider,
    onLogin,
    onUpgrade,
  }: {
    provider: { name: string }
    onLogin: () => void
    onUpgrade: () => void
  }) => (
    <div data-testid="translation-result-card">
      <span>{provider.name}</span>
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

function renderSidebarTextTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue()
  const store = createStore()

  return {
    ...render(
      <JotaiProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <SidebarTextTab />
        </QueryClientProvider>
      </JotaiProvider>,
    ),
    invalidateSpy,
  }
}

describe("sidebarTextTab", () => {
  beforeEach(() => {
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
        request: expect.objectContaining({ text: "你好呀" }),
      }),
    )
  })

  it("renders result cards for providers selected through the real picker", () => {
    providersConfigMock.mockReturnValue([
      {
        id: "deepseek",
        name: "DeepSeek-V4-Pro",
        provider: "deepseek",
        enabled: true,
        apiKey: "test",
        model: { model: "deepseek-chat", isCustomModel: false, customModel: null },
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
        id: "qwen",
        name: "Qwen3.5-plus",
        provider: "alibaba",
        enabled: true,
        apiKey: "test",
        model: { model: "qwen-plus", isCustomModel: false, customModel: null },
      },
    ])

    renderSidebarTextTab()

    let resultCards = screen.getAllByTestId("translation-result-card")
    expect(resultCards).toHaveLength(3)
    expect(within(resultCards[0]).getByText("DeepSeek-V4-Pro")).toBeInTheDocument()
    expect(within(resultCards[1]).getByText("Google Translate")).toBeInTheDocument()
    expect(within(resultCards[2]).getByText("Microsoft Translate")).toBeInTheDocument()
    expect(resultCards.some(card => within(card).queryByText("Qwen3.5-plus"))).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.selectProviders" }))
    fireEvent.click(screen.getByRole("checkbox", { name: /Qwen3.5-plus/ }))

    resultCards = screen.getAllByTestId("translation-result-card")
    expect(resultCards).toHaveLength(4)
    expect(within(resultCards[0]).getByText("DeepSeek-V4-Pro")).toBeInTheDocument()
    expect(within(resultCards[1]).getByText("Google Translate")).toBeInTheDocument()
    expect(within(resultCards[2]).getByText("Microsoft Translate")).toBeInTheDocument()
    expect(within(resultCards[3]).getByText("Qwen3.5-plus")).toBeInTheDocument()
  })
})
