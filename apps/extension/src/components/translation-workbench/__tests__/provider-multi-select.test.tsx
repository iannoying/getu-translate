// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
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

function ControlledProviderMultiSelect() {
  const [selectedIds, setSelectedIds] = useState(["deepseek"])

  return (
    <ProviderMultiSelect
      providers={providers}
      selectedIds={selectedIds}
      onSelectedIdsChange={setSelectedIds}
      portalContainer={document.body}
    />
  )
}

describe("providerMultiSelect", () => {
  it("opens a multi-provider checklist and toggles providers without closing", () => {
    render(<ControlledProviderMultiSelect />)

    const trigger = screen.getByRole("button", { name: "translationWorkbench.selectProviders" })
    expect(trigger).toHaveTextContent("1")

    fireEvent.click(trigger)

    expect(screen.getByRole("group", { name: "translationWorkbench.selectProviders" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /DeepSeek-V4-Pro/ })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /Qwen3.5-plus/ })).not.toBeChecked()

    fireEvent.click(screen.getByRole("checkbox", { name: /Qwen3.5-plus/ }))

    expect(screen.getByRole("checkbox", { name: /Qwen3.5-plus/ })).toBeChecked()
    expect(screen.getByRole("group", { name: "translationWorkbench.selectProviders" })).toBeInTheDocument()
    expect(trigger).toHaveTextContent("2")
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
    fireEvent.click(screen.getByRole("checkbox", { name: /DeepSeek-V4-Pro/ }))

    expect(onSelectedIdsChange).not.toHaveBeenCalled()
    expect(screen.getByRole("checkbox", { name: /DeepSeek-V4-Pro/ })).toBeChecked()
  })
})
