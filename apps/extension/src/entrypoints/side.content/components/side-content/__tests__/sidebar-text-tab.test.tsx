// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { atom } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarTextTab } from "../sidebar-text-tab"

const sendMessageMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const useAuthRefreshOnFocusMock = vi.hoisted(() => vi.fn())

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
    useSession: () => ({ data: null, isPending: false }),
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

vi.mock("@/components/translation-workbench/use-auth-refresh", () => ({
  useAuthRefreshOnFocus: useAuthRefreshOnFocusMock,
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

describe("sidebarTextTab", () => {
  beforeEach(() => {
    sendMessageMock.mockClear()
    useAuthRefreshOnFocusMock.mockClear()
  })

  it("opens login and upgrade links through background messaging", () => {
    render(<SidebarTextTab />)

    expect(useAuthRefreshOnFocusMock).toHaveBeenCalledWith(null)

    fireEvent.click(screen.getByRole("button", { name: "login" }))
    fireEvent.click(screen.getByRole("button", { name: "upgrade" }))

    expect(sendMessageMock).toHaveBeenCalledWith("openPage", { url: "https://getutranslate.com/log-in?redirect=/" })
    expect(sendMessageMock).toHaveBeenCalledWith("openPage", { url: "https://getutranslate.com/pricing" })
  })
})
