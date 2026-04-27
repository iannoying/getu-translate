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
  default: ({ logo, name, textClassName }: { logo: string, name?: string, textClassName?: string }) => (
    <span>
      <img alt={name} src={new URL(logo, "chrome-extension://test/").href} />
      {name && <span className={textClassName}>{name}</span>}
    </span>
  ),
}))

vi.mock("@/utils/constants/providers", () => ({
  getProviderLogo: (provider: TranslateProviderConfig) => {
    if (provider.provider === "deepseek")
      return "/assets/providers/deepseek-light.svg"
    if (provider.provider === "getu-pro" && provider.model.model === "qwen3.5-plus")
      return "/assets/providers/qwen-light.svg"
    throw new Error("missing provider logo")
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

const qwenProvider = {
  ...deepseekProvider,
  id: "qwen-pro",
  name: "Qwen3.5-plus",
  provider: "getu-pro",
  model: { model: "qwen3.5-plus", isCustomModel: false, customModel: null },
} as unknown as TranslateProviderConfig

describe("workbenchProviderLogo", () => {
  it("renders the provider catalog logo when available", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    const { container } = render(<WorkbenchProviderLogo provider={deepseekProvider} />)

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "chrome-extension://test/assets/providers/deepseek-light.svg",
    )
    expect(screen.getByText("DeepSeek-V4-Pro")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "DeepSeek-V4-Pro" })).not.toBeInTheDocument()
  })

  it("keeps icon-only catalog logo accessible by provider name", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    render(<WorkbenchProviderLogo provider={deepseekProvider} iconOnly />)

    expect(screen.getByRole("img", { name: "DeepSeek-V4-Pro" })).toHaveAttribute(
      "src",
      "chrome-extension://test/assets/providers/deepseek-light.svg",
    )
  })

  it("uses model-specific logos for GetU Pro model rows", async () => {
    const { WorkbenchProviderLogo } = await import("../provider-logo")

    const { container } = render(<WorkbenchProviderLogo provider={qwenProvider} />)

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "chrome-extension://test/assets/providers/qwen-light.svg",
    )
    expect(screen.getByText("Qwen3.5-plus")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Qwen3.5-plus" })).not.toBeInTheDocument()
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
