// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ProviderMultiSelect } from "../provider-multi-select"

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      getURL: (path = "") => `chrome-extension://test${path}`,
    },
  },
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    "deepseek": { logo: () => "/deepseek.svg", name: "DeepSeek", website: "" },
    "alibaba": { logo: () => "/alibaba.svg", name: "Alibaba", website: "" },
    "google-translate": { logo: () => "/google.svg", name: "Google Translate", website: "" },
  },
}))

const providers: TranslateProviderConfig[] = [
  {
    id: "google",
    name: "Google Translate",
    provider: "google-translate",
    enabled: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek-V4-Pro",
    provider: "deepseek",
    enabled: true,
    apiKey: "key",
    model: { model: "deepseek-chat", isCustomModel: false, customModel: null },
  },
  {
    id: "qwen",
    name: "Qwen3.5-plus",
    provider: "alibaba",
    enabled: true,
    apiKey: "key",
    model: { model: "qwen-plus", isCustomModel: false, customModel: null },
  },
] as TranslateProviderConfig[]

describe("providerMultiSelect", () => {
  it("opens a multi-provider checklist and toggles providers without closing", () => {
    const onSelectedIdsChange = vi.fn()

    render(
      <ProviderMultiSelect
        providers={providers}
        selectedIds={["deepseek"]}
        onSelectedIdsChange={onSelectedIdsChange}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.selectProviders" }))

    expect(screen.getByRole("menu", { name: "translationWorkbench.selectProviders" })).toBeInTheDocument()
    expect(screen.getByRole("menuitemcheckbox", { name: /DeepSeek-V4-Pro/ })).toHaveAttribute("aria-checked", "true")

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Qwen3.5-plus/ }))

    expect(onSelectedIdsChange).toHaveBeenCalledWith(["deepseek", "qwen"])
    expect(screen.getByRole("menu", { name: "translationWorkbench.selectProviders" })).toBeInTheDocument()
  })

  it("does not allow deselecting the last provider", () => {
    const onSelectedIdsChange = vi.fn()

    render(
      <ProviderMultiSelect
        providers={providers}
        selectedIds={["deepseek"]}
        onSelectedIdsChange={onSelectedIdsChange}
        portalContainer={document.body}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "translationWorkbench.selectProviders" }))
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /DeepSeek-V4-Pro/ }))

    expect(onSelectedIdsChange).not.toHaveBeenCalled()
  })
})
