import type { ReactElement } from "react"
import { browser } from "#imports"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/base-ui/dialog"
import { useCheckout } from "@/hooks/use-checkout"
import { useEntitlements } from "@/hooks/use-entitlements"
import { authClient } from "@/utils/auth/auth-client"
import { WEBSITE_URL } from "@/utils/constants/url"
import { i18n } from "@/utils/i18n"

type Plan = "pro_monthly" | "pro_yearly"
type Currency = "usd" | "cny"

function detectCurrency(): Currency {
  const lang = typeof navigator !== "undefined" ? navigator.language : "en"
  return lang.toLowerCase().startsWith("zh") ? "cny" : "usd"
}

interface UpgradeDialogProps {
  /** Optional trigger slot — if omitted, dialog is controlled via open/onOpenChange */
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Analytics tag to distinguish "which feature triggered the paywall" */
  source?: string
}

export function UpgradeDialog({ trigger, open, onOpenChange }: UpgradeDialogProps) {
  const [plan, setPlan] = useState<Plan>("pro_yearly")
  const { startCheckout, isLoading } = useCheckout()

  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const { data: entitlements } = useEntitlements(userId)
  const billingEnabled = entitlements?.billingEnabled ?? false

  const currency = detectCurrency()
  const isCny = currency === "cny"

  const priceLabel = plan === "pro_yearly"
    ? (isCny ? i18n.t("billing.upgrade.priceCnyYearly") : i18n.t("billing.upgrade.priceUsdYearly"))
    : (isCny ? i18n.t("billing.upgrade.priceCnyMonthly") : i18n.t("billing.upgrade.priceUsdMonthly"))

  const ctaLabel = isCny ? i18n.t("billing.upgrade.ctaCny") : i18n.t("billing.upgrade.cta")
  const noteKey = isCny ? "billing.upgrade.noteCny" : "billing.upgrade.noteUsd"

  async function handleUpgrade() {
    await startCheckout({ plan, currency })
  }

  return (
    // TODO: Pass shadow-root container once a ShadowWrapperContext is available
    // (follow-up issue: content-script dialogs escape the shadow root and lose
    // Tailwind isolation). See react-shadow-host/ for the planned pattern.
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger != null && (
        <DialogTrigger render={trigger}>
          {null}
        </DialogTrigger>
      )}
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{i18n.t("billing.upgrade.title")}</DialogTitle>
          <DialogDescription>{i18n.t("billing.upgrade.description")}</DialogDescription>
        </DialogHeader>

        {/* Plan toggle */}
        <div className="flex gap-2 rounded-md border p-1">
          <button
            type="button"
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${plan === "pro_yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setPlan("pro_yearly")}
          >
            {i18n.t("billing.upgrade.planYearly")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${plan === "pro_monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setPlan("pro_monthly")}
          >
            {i18n.t("billing.upgrade.planMonthly")}
          </button>
        </div>

        <p className="text-center text-lg font-semibold">{priceLabel}</p>
        <p className="text-xs text-muted-foreground">{i18n.t(noteKey)}</p>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {i18n.t("billing.upgrade.close")}
          </DialogClose>
          {userId == null
            ? (
                <Button onClick={() => browser.tabs.create({ url: `${WEBSITE_URL}/log-in?redirect=/` })}>
                  {i18n.t("billing.upgrade.loginToSubscribe")}
                </Button>
              )
            : billingEnabled
              ? (
                  <Button onClick={handleUpgrade} disabled={isLoading}>
                    {isLoading ? i18n.t("billing.upgrade.loading") : ctaLabel}
                  </Button>
                )
              : (
                  <Button disabled>
                    {i18n.t("billing.upgrade.comingSoon")}
                  </Button>
                )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
