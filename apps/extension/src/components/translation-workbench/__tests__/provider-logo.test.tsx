// @vitest-environment jsdom
import type { TranslateProviderConfig } from "@/types/config/provider"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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

vi.mock("@/components/provider-icon", () => ({
  default: ({ logo, name }: { logo: string, name?: string }) => (
    <span>
      <img alt={name} src={new URL(logo, "chrome-extension://test/").href} />
      {name && <span>{name}</span>}
    </span>
  ),
}))

vi.mock("@/utils/constants/providers", () => ({
  PROVIDER_ITEMS: {
    deepseek: {
      logo: () => "/assets/providers/deepseek-light.svg",
      name: "DeepSeek",
      website: "https://deepseek.com",
    },
  },
}))

const deepseekProvider: TranslateProviderConfig = {
  id: "deepseek-v4-pro",
  name: "DeepSeek-V4-Pro",
  provider: "deepseek",
  enabled: true,
  apiKey: "key",
  model: { model: "deepseek-chat", isCustomModel: false, customModel: null },
}

const unknownProvider = {
  ...deepseekProvider,
  id: "unknown-provider",
  name: "Mystery Model",
  provider: "missing-provider",
} as unknown as TranslateProviderConfig

describe("workbenchProviderLogo", () => {
  it("renders the provider catalog logo when available", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    render(<WorkbenchProviderLogo provider={deepseekProvider} />)

    expect(screen.getByRole("img", { name: "DeepSeek-V4-Pro" })).toHaveAttribute(
      "src",
      "chrome-extension://test/assets/providers/deepseek-light.svg",
    )
  })

  it("falls back to provider initials when no catalog logo exists", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    render(<WorkbenchProviderLogo provider={unknownProvider} />)

    expect(screen.getByText("Mystery Model")).toBeInTheDocument()
    expect(screen.queryByLabelText("Mystery Model")).not.toBeInTheDocument()
  })

  it("keeps icon-only fallback accessible by provider name", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    render(<WorkbenchProviderLogo provider={unknownProvider} iconOnly />)

    expect(screen.getByLabelText("Mystery Model")).toHaveTextContent("M")
    expect(screen.queryByText("Mystery Model")).not.toBeInTheDocument()
  })
})
