// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WEBSITE_URL } from "@/utils/constants/url"
import { UpgradeDialog } from "../upgrade-dialog"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// i18n is already mocked globally in vitest.setup.ts: t(key) => key

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("upgradeDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("renders title and description from i18n keys", () => {
    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText("billing.upgrade.title")).toBeInTheDocument()
    expect(screen.getByText("billing.upgrade.description")).toBeInTheDocument()
  })

  it("cTA button opens pricing URL with source in a new tab", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} source="test-feature" />)

    const cta = screen.getByRole("button", { name: "billing.upgrade.cta" })
    fireEvent.click(cta)

    expect(openSpy).toHaveBeenCalledWith(
      `${WEBSITE_URL}/pricing?source=test-feature`,
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("cTA defaults source to 'paywall' when source is omitted", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    const cta = screen.getByRole("button", { name: "billing.upgrade.cta" })
    fireEvent.click(cta)

    expect(openSpy).toHaveBeenCalledWith(
      `${WEBSITE_URL}/pricing?source=paywall`,
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("uncontrolled mode: clicking a trigger opens the dialog", () => {
    render(
      <UpgradeDialog trigger={<button>Open</button>} />,
    )

    expect(screen.queryByText("billing.upgrade.title")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Open" }))

    expect(screen.getByText("billing.upgrade.title")).toBeInTheDocument()
  })

  it("controlled mode: respects open prop and calls onOpenChange", () => {
    const onOpenChange = vi.fn()

    const { rerender } = render(<UpgradeDialog open={false} onOpenChange={onOpenChange} />)

    expect(screen.queryByText("billing.upgrade.title")).not.toBeInTheDocument()

    rerender(<UpgradeDialog open={true} onOpenChange={onOpenChange} />)

    expect(screen.getByText("billing.upgrade.title")).toBeInTheDocument()
  })

  it("uRL-encodes special characters in source param", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} source="foo &plan=yearly#x" />)

    const cta = screen.getByRole("button", { name: "billing.upgrade.cta" })
    fireEvent.click(cta)

    expect(openSpy).toHaveBeenCalledWith(
      `${WEBSITE_URL}/pricing?source=foo+%26plan%3Dyearly%23x`,
      "_blank",
      "noopener,noreferrer",
    )
  })
})
