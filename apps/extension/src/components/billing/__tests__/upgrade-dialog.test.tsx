// @vitest-environment jsdom
import type { Entitlements } from "@/types/entitlements"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { UpgradeDialog } from "../upgrade-dialog"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// i18n is already mocked globally in vitest.setup.ts: t(key) => key

const useSessionMock = vi.fn()

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
  },
}))

const useEntitlementsMock = vi.fn()

vi.mock("@/hooks/use-entitlements", () => ({
  useEntitlements: (userId: string | null) => useEntitlementsMock(userId),
}))

const startCheckoutMock = vi.fn()

vi.mock("@/hooks/use-checkout", () => ({
  useCheckout: () => ({
    startCheckout: startCheckoutMock,
    isLoading: false,
    error: null,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "vocab_unlimited"],
  quota: {},
  expiresAt: "2099-01-01T00:00:00.000Z",
  graceUntil: null,
  billingEnabled: true,
  billingProvider: "paddle",
}

const BILLING_ENABLED_FREE: Entitlements = {
  ...FREE_ENTITLEMENTS,
  billingEnabled: true,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("upgradeDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useSessionMock.mockReturnValue({ data: null, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })
    startCheckoutMock.mockResolvedValue(undefined)
  })

  it("renders title and description from i18n keys", () => {
    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText("billing.upgrade.title")).toBeInTheDocument()
    expect(screen.getByText("billing.upgrade.description")).toBeInTheDocument()
  })

  it("shows plan toggle buttons for yearly and monthly", () => {
    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText("billing.upgrade.planYearly")).toBeInTheDocument()
    expect(screen.getByText("billing.upgrade.planMonthly")).toBeInTheDocument()
  })

  it("defaults to yearly plan selection", () => {
    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    const yearlyBtn = screen.getByText("billing.upgrade.planYearly")
    expect(yearlyBtn.className).toContain("bg-primary")
    const monthlyBtn = screen.getByText("billing.upgrade.planMonthly")
    expect(monthlyBtn.className).not.toContain("bg-primary")
  })

  it("switches plan when monthly button is clicked", () => {
    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText("billing.upgrade.planMonthly"))

    const monthlyBtn = screen.getByText("billing.upgrade.planMonthly")
    expect(monthlyBtn.className).toContain("bg-primary")
  })

  it("shows coming soon button when billingEnabled is false", () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText("billing.upgrade.comingSoon")).toBeInTheDocument()
    const comingSoonBtn = screen.getByRole("button", { name: "billing.upgrade.comingSoon" })
    expect(comingSoonBtn).toBeDisabled()
  })

  it("shows cTA upgrade button when billingEnabled is true", () => {
    useEntitlementsMock.mockReturnValue({ data: BILLING_ENABLED_FREE, isLoading: false, isFromCache: false })

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText("billing.upgrade.cta")).toBeInTheDocument()
    expect(screen.queryByText("billing.upgrade.comingSoon")).not.toBeInTheDocument()
  })

  it("calls startCheckout with yearly plan when cTA is clicked", async () => {
    useEntitlementsMock.mockReturnValue({ data: BILLING_ENABLED_FREE, isLoading: false, isFromCache: false })

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText("billing.upgrade.cta"))

    await waitFor(() => {
      expect(startCheckoutMock).toHaveBeenCalledWith({ plan: "pro_yearly", provider: "stripe", paymentMethod: "card" })
    })
  })

  it("calls startCheckout with monthly plan when plan is switched then cTA clicked", async () => {
    useEntitlementsMock.mockReturnValue({ data: BILLING_ENABLED_FREE, isLoading: false, isFromCache: false })

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText("billing.upgrade.planMonthly"))
    fireEvent.click(screen.getByText("billing.upgrade.cta"))

    await waitFor(() => {
      expect(startCheckoutMock).toHaveBeenCalledWith({ plan: "pro_monthly", provider: "stripe", paymentMethod: "card" })
    })
  })

  it("calls startCheckout with paymentMethod=alipay when alipay is selected", async () => {
    useEntitlementsMock.mockReturnValue({ data: BILLING_ENABLED_FREE, isLoading: false, isFromCache: false })

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText("billing.upgrade.paymentMethodAlipay"))
    fireEvent.click(screen.getByText("billing.upgrade.cta"))

    await waitFor(() => {
      expect(startCheckoutMock).toHaveBeenCalledWith({ plan: "pro_yearly", provider: "stripe", paymentMethod: "alipay" })
    })
  })

  it("calls startCheckout with paymentMethod=wechat_pay when wechat is selected", async () => {
    useEntitlementsMock.mockReturnValue({ data: BILLING_ENABLED_FREE, isLoading: false, isFromCache: false })

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText("billing.upgrade.paymentMethodWechat"))
    fireEvent.click(screen.getByText("billing.upgrade.cta"))

    await waitFor(() => {
      expect(startCheckoutMock).toHaveBeenCalledWith({ plan: "pro_yearly", provider: "stripe", paymentMethod: "wechat_pay" })
    })
  })

  it("uncontrolled mode: clicking a trigger opens the dialog", () => {
    useEntitlementsMock.mockReturnValue({ data: FREE_ENTITLEMENTS, isLoading: false, isFromCache: false })

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

  it("shows pro entitlements from signed-in user", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1" } }, isPending: false })
    useEntitlementsMock.mockReturnValue({ data: PRO_ENTITLEMENTS, isLoading: false, isFromCache: false })

    render(<UpgradeDialog open={true} onOpenChange={vi.fn()} />)

    // billingEnabled=true from PRO_ENTITLEMENTS, so we show the CTA
    expect(screen.getByText("billing.upgrade.cta")).toBeInTheDocument()
  })
})
