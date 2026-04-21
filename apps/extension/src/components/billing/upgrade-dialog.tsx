import type { ReactElement } from "react"
import { i18n } from "#i18n"
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
import { WEBSITE_URL } from "@/utils/constants/url"

interface UpgradeDialogProps {
  /** Optional trigger slot — if omitted, dialog is controlled via open/onOpenChange */
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Analytics tag to distinguish "which feature triggered the paywall" */
  source?: string
}

export function UpgradeDialog({ trigger, open, onOpenChange, source }: UpgradeDialogProps) {
  function handleCta() {
    const effectiveSource = source ?? "paywall"
    const url = new URL(`${WEBSITE_URL}/pricing`)
    url.searchParams.set("source", effectiveSource)
    window.open(url.toString(), "_blank", "noopener,noreferrer")
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
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {i18n.t("billing.upgrade.close")}
          </DialogClose>
          <Button onClick={handleCta}>
            {i18n.t("billing.upgrade.cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
