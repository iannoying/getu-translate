// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { atom } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarTextTab } from "../sidebar-text-tab"

const sendMessageMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const sessionRefetchMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("#imports", () => ({
  browser: { tabs: { create: vi.fn() } },
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

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    language: atom({ sourceCode: "auto", targetCode: "cmn", level: "intermediate" }),
    providersConfig: atom([
      {
        id: "getu-pro",
        name: "GetU Pro",
        provider: "getu-pro",
        enabled: true,
        apiKey: "test",
        model: { model: "deepseek-v4-pro", isCustomModel: false, customModel: null },
      },
    ]),
  },
}))

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false, refetch: sessionRefetchMock }),
  },
}))

vi.mock("@/hooks/use-entitlements", () => ({
  useEntitlements: () => ({
    data: {
      tier: "free",
      features: [],
      quota: {},
      expiresAt: null,
      graceUntil: null,
      billingEnabled: false,
      billingProvider: null,
    },
    isLoading: false,
    isFromCache: false,
  }),
}))

vi.mock("../../../index", () => ({
  shadowWrapper: document.body,
}))

vi.mock("@/components/translation-workbench/language-picker", () => ({
  WorkbenchLanguagePicker: () => <div data-testid="language-picker" />,
}))

vi.mock("@/components/translation-workbench/provider-multi-select", () => ({
  ProviderMultiSelect: () => <div data-testid="provider-picker" />,
}))

vi.mock("@/components/translation-workbench/result-card", () => ({
  TranslationWorkbenchResultCard: ({
    onLogin,
    onUpgrade,
  }: {
    onLogin: () => void
    onUpgrade: () => void
  }) => (
    <div>
      <button type="button" onClick={onLogin}>login</button>
      <button type="button" onClick={onUpgrade}>upgrade</button>
    </div>
  ),
}))

vi.mock("@/components/translation-workbench/translate-runner", () => ({
  runTranslationWorkbenchRequest: vi.fn(),
}))

function renderSidebarTextTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue()

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <SidebarTextTab />
      </QueryClientProvider>,
    ),
    invalidateSpy,
  }
}

describe("sidebarTextTab", () => {
  beforeEach(() => {
    sendMessageMock.mockClear()
    sessionRefetchMock.mockClear()
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
})
