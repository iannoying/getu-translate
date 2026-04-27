// @vitest-environment jsdom
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import { describe, expect, it, vi } from "vitest"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { baseUILocalePreferenceAtom, I18nReactiveRoot } from "@/utils/i18n"
import App from "../app"
import { isSideOpenAtom } from "../atoms"

const extensionApi = vi.hoisted(() => {
  const browser = {
    runtime: { getURL: (path = "") => `chrome-extension://test${path}` },
    i18n: { getUILanguage: () => "zh-CN" },
  }

  Object.defineProperty(globalThis, "browser", {
    configurable: true,
    value: browser,
  })

  return {
    browser,
    storage: {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => undefined),
      watch: vi.fn(() => () => undefined),
    },
  }
})

vi.unmock("@/utils/i18n")

vi.mock("#imports", () => extensionApi)

vi.mock("@/components/frog-toast", () => ({
  default: () => null,
}))

vi.mock("../components/floating-button", () => ({
  default: () => null,
}))

vi.mock("../components/side-content/sidebar-text-tab", () => ({
  SidebarTextTab: () => <h2>文本翻译</h2>,
}))

vi.mock("../components/side-content/sidebar-document-tab", () => ({
  SidebarDocumentTab: () => <h2>文档翻译</h2>,
}))

function HydrateAtoms({ children }: { children: ReactNode }) {
  const initialValues: [
    [typeof configAtom, typeof DEFAULT_CONFIG],
    [typeof baseUILocalePreferenceAtom, "auto"],
  ] = [
    [configAtom, DEFAULT_CONFIG],
    [baseUILocalePreferenceAtom, "auto"],
  ]

  useHydrateAtoms(initialValues)
  return children
}

describe("side.content i18n hydration", () => {
  it("renders sidebar copy using the browser locale when preference is auto", () => {
    const store = createStore()
    void store.set(isSideOpenAtom, true)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <HydrateAtoms>
            <I18nReactiveRoot>
              <App />
            </I18nReactiveRoot>
          </HydrateAtoms>
        </JotaiProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByRole("tab", { name: "文本" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "文档" })).toBeInTheDocument()
    expect(screen.getByLabelText("关闭侧边栏")).toBeInTheDocument()
  })
})
