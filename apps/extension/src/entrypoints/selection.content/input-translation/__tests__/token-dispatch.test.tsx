// @vitest-environment jsdom
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useInputTranslation } from "../use-input-translation"

// ---------------------------------------------------------------------------
// Mocks — stub out billing + translation infra so we're testing pure dispatch
// ---------------------------------------------------------------------------

const checkAndIncrementMock = vi.fn<() => Promise<boolean>>()
vi.mock("../quota/use-input-quota", () => ({
  useInputTranslationQuota: () => ({
    isLoading: false,
    used: 0,
    limit: 50,
    canTranslate: true,
    checkAndIncrement: checkAndIncrementMock,
  }),
  FREE_INPUT_TRANSLATION_DAILY_LIMIT: 50,
}))

const guardMock = vi.fn()
vi.mock("@/hooks/use-pro-guard", () => ({
  useProGuard: () => ({
    isLoading: false,
    guard: guardMock,
    dialogProps: { open: false, onOpenChange: vi.fn(), source: undefined },
  }),
}))

const translateTextForInputMock = vi.fn<(text: string, from: string, to: string) => Promise<string>>()
vi.mock("@/utils/host/translate/translate-variants", () => ({
  translateTextForInput: (text: string, from: string, to: string) => translateTextForInputMock(text, from, to),
}))

vi.mock("@/utils/analytics", () => ({
  trackFeatureAttempt: async (_ctx: unknown, fn: () => Promise<string>) => fn(),
  createFeatureUsageContext: () => ({}),
}))

const config: {
  enabled: boolean
  providerId: string
  fromLang: string
  toLang: string
  enableCycle: boolean
  timeThreshold: number
  triggerMode: "triple-space" | "token"
  tokenPrefix: string
} = {
  enabled: true,
  providerId: "google",
  fromLang: "eng",
  toLang: "cmn",
  enableCycle: false,
  timeThreshold: 300,
  triggerMode: "token",
  tokenPrefix: "//",
}
vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    inputTranslation: { toString: () => "atom:inputTranslation" },
  },
}))
vi.mock("jotai", async () => {
  const actual = await vi.importActual<typeof import("jotai")>("jotai")
  return {
    ...actual,
    useAtom: () => [config, vi.fn()],
  }
})

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function renderWithProviders<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const store = createStore()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  )
  return renderHook(hook, { wrapper })
}

async function dispatchInput(el: HTMLElement, opts: { isComposing?: boolean } = {}) {
  // jsdom doesn't ship InputEvent with isComposing; synthesize on the prototype.
  const ev = new Event("input", { bubbles: true, cancelable: true }) as InputEvent
  Object.defineProperty(ev, "isComposing", { value: opts.isComposing ?? false, configurable: true })
  el.focus()
  el.dispatchEvent(ev)
  await new Promise(r => setTimeout(r, 10))
}

beforeEach(() => {
  checkAndIncrementMock.mockReset()
  checkAndIncrementMock.mockResolvedValue(true)
  guardMock.mockReset()
  translateTextForInputMock.mockReset()
  translateTextForInputMock.mockResolvedValue("你好")
  document.body.innerHTML = ""
  ;(document as unknown as { execCommand: (...args: unknown[]) => boolean }).execCommand = () => true
  ;(HTMLElement.prototype as unknown as { animate: (...args: unknown[]) => unknown }).animate = () => ({})
  config.triggerMode = "token"
  config.tokenPrefix = "//"
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useInputTranslation · token trigger", () => {
  it("translates `hello //en ` with toLang override", async () => {
    const textarea = document.createElement("textarea")
    textarea.value = "hello //en "
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await dispatchInput(textarea)
      await new Promise(r => setTimeout(r, 20))
    })

    expect(checkAndIncrementMock).toHaveBeenCalledTimes(1)
    expect(translateTextForInputMock).toHaveBeenCalledWith("hello", "eng", "eng")
  })

  it("ignores token match fired during IME composition", async () => {
    const textarea = document.createElement("textarea")
    textarea.value = "你好 //en "
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await dispatchInput(textarea, { isComposing: true })
    })

    expect(translateTextForInputMock).not.toHaveBeenCalled()
  })

  it("ignores input events whose field content doesn't match the trigger", async () => {
    const textarea = document.createElement("textarea")
    textarea.value = "plain text with no trigger"
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await dispatchInput(textarea)
    })

    expect(translateTextForInputMock).not.toHaveBeenCalled()
  })

  it("honors the configured custom prefix", async () => {
    config.tokenPrefix = "++"
    const textarea = document.createElement("textarea")
    textarea.value = "salut ++fr "
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await dispatchInput(textarea)
      await new Promise(r => setTimeout(r, 20))
    })

    expect(translateTextForInputMock).toHaveBeenCalledWith("salut", "eng", "fra")
  })
})

describe("useInputTranslation · triple-space mode ignores input events", () => {
  it("does not fire on plain input events when mode is triple-space", async () => {
    config.triggerMode = "triple-space"
    const textarea = document.createElement("textarea")
    textarea.value = "hello //en "
    document.body.appendChild(textarea)

    renderWithProviders(() => useInputTranslation())
    await act(async () => {
      await dispatchInput(textarea)
    })

    // Even though the value matches a token pattern, triple-space mode
    // does NOT listen for input events, so nothing should fire.
    expect(translateTextForInputMock).not.toHaveBeenCalled()
    expect(checkAndIncrementMock).not.toHaveBeenCalled()
  })
})
