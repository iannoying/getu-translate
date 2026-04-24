import { useAtomValue, useSetAtom } from "jotai"
import { hasFeature, isPro } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
/**
 * Free-tier watermark (M3 PR#C Task 4).
 *
 * Subtle bottom-right button that reads "Translated by GetU — Upgrade to
 * remove". Visible only for Free users *after* they've seen at least one
 * translated page this session — showing it on an unmolested viewer would be
 * false advertising. Clicking opens the shared UpgradeDialog with
 * `source="pdf-translation-watermark"` for attribution.
 *
 * Visibility matrix:
 *   - Pro user (any of `pdf_translate_unlimited` or `pdf_translate_export`
 *     granted, or `isPro()` true)                          → hidden
 *   - Free user, zero translated pages this session        → hidden
 *   - Free user, ≥1 translated page this session           → visible
 *
 * Why three feature flags: both `pdf_translate_unlimited` and
 * `pdf_translate_export` imply a paid plan that has already bought out the
 * watermark. We also include the pure `isPro` gate so a Pro user without
 * either flag (mid-rollout / misconfigured SKU) still doesn't see the
 * watermark — defensive layering that matches the export-button's inverse.
 *
 * Position: fixed to the viewer container's bottom-right with `z-index: 9`,
 * one below the export button (`z-index: 10`) so the button stays clickable
 * above the watermark on narrow viewports.
 */
import { i18n } from "@/utils/i18n"
import { hasAnyTranslatedPageAtom, showPdfUpgradeDialogAtom } from "../atoms"

export function Watermark() {
  const entitlements = useAtomValue(entitlementsAtom)
  const hasAnyTranslated = useAtomValue(hasAnyTranslatedPageAtom)
  const setDialogState = useSetAtom(showPdfUpgradeDialogAtom)

  // Treat any of the three Pro signals as "hide the watermark". The export
  // and unlimited features are the two Pro SKUs that remove the watermark;
  // the broad `isPro` check is a safety net for misconfigured entitlements.
  const isProUser
    = isPro(entitlements)
      || hasFeature(entitlements, "pdf_translate_unlimited")
      || hasFeature(entitlements, "pdf_translate_export")

  if (isProUser || !hasAnyTranslated)
    return null

  return (
    <button
      type="button"
      data-testid="pdf-watermark"
      aria-label={i18n.t("pdfViewer.watermark.ariaLabel")}
      onClick={() => setDialogState({ open: true, source: "pdf-translation-watermark" })}
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9,
        opacity: 0.4,
        fontSize: 11,
        color: "#fff",
        background: "rgba(0, 0, 0, 0.6)",
        border: "none",
        borderRadius: 4,
        padding: "4px 8px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {i18n.t("pdfViewer.watermark.label")}
    </button>
  )
}
