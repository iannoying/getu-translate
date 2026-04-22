/**
 * Pro-gated "Download bilingual PDF" button (M3 PR#C Task 3).
 *
 * Lives in a fixed-position root (`#export-button-root`) at the top-right of
 * the PDF viewer. The button:
 *
 *   - Reads the shared `entitlementsAtom`; renders *active* when the user is
 *     Pro **and** the backend grants `pdf_translate_export`, *disabled* with
 *     an upsell tooltip otherwise.
 *   - On click (Pro): calls {@link exportBilingualPdf} to get a Blob, then
 *     triggers a browser download with a `*-bilingual.pdf` filename derived
 *     from the original URL.
 *   - On click (Free): no-op for Task 3. The Task 4 watermark owns the
 *     full upsell flow (UpgradeDialog) so we avoid duplicating it here.
 *
 * i18n: labels are sourced from `pdfViewer.export.*` keys (M3 PR#C Task 6).
 */
import { i18n } from "#imports"
import { useAtomValue } from "jotai"
import { useState } from "react"
import { hasFeature, isPro } from "@/types/entitlements"
import { entitlementsAtom } from "@/utils/atoms/entitlements"
import { exportBilingualPdf } from "../export/pdf-lib-writer"

export interface ExportButtonProps {
  /** Content-addressed fingerprint of the current PDF. */
  fileHash: string
  /** Source URL of the original PDF (viewer `?src=` param). */
  src: string
  /** Target language code used for cached translations. */
  targetLang: string
  /** Provider id used for cached translations. */
  providerId: string
}

export function ExportButton(props: ExportButtonProps) {
  const entitlements = useAtomValue(entitlementsAtom)
  const canExport
    = isPro(entitlements) && hasFeature(entitlements, "pdf_translate_export")
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (!canExport || busy)
      return
    setBusy(true)
    try {
      const blob = await exportBilingualPdf({
        fileHash: props.fileHash,
        src: props.src,
        targetLang: props.targetLang,
        providerId: props.providerId,
      })
      triggerDownload(blob, deriveFilename(props.src))
    }
    catch (err) {
      // Keep this non-fatal — the viewer stays usable after a failed export.
      // Surfacing a user-visible error is deferred to a later toast/snackbar PR.
      console.error("[pdf-viewer] export failed:", err)
    }
    finally {
      setBusy(false)
    }
  }

  const title = canExport
    ? i18n.t("pdfViewer.export.tooltipEnabled")
    : i18n.t("pdfViewer.export.tooltipDisabled")

  return (
    <button
      type="button"
      data-testid="pdf-export-button"
      data-export-enabled={canExport ? "true" : "false"}
      disabled={!canExport || busy}
      aria-label={i18n.t("pdfViewer.export.ariaLabel")}
      aria-busy={busy ? "true" : "false"}
      title={title}
      onClick={handleClick}
      style={{
        padding: "8px 12px",
        borderRadius: "6px",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        background: canExport ? "rgba(45, 127, 249, 0.9)" : "rgba(80, 80, 80, 0.6)",
        color: canExport ? "#fff" : "rgba(255, 255, 255, 0.5)",
        cursor: canExport && !busy ? "pointer" : "not-allowed",
        fontSize: "13px",
        fontFamily: "inherit",
        opacity: canExport ? 1 : 0.7,
      }}
    >
      {busy ? i18n.t("pdfViewer.export.buttonLabelBusy") : i18n.t("pdfViewer.export.buttonLabelWithIcon")}
    </button>
  )
}

/**
 * Trigger a browser download for `blob` with the given `filename`. Uses a
 * hidden `<a>` element so cross-origin PDF hosts don't interfere with the
 * download flow. Wrapped in try/finally so the object URL is always
 * revoked and the anchor is always removed even if `a.click()` throws
 * (e.g. under jsdom navigation guards or sandbox-restricted frames).
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    document.body.appendChild(a)
    try {
      a.click()
    }
    finally {
      document.body.removeChild(a)
    }
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Derive a bilingual-export filename from the PDF source URL.
 *
 *   - `https://host/path/foo.pdf` → `foo-bilingual.pdf`
 *   - `file:///tmp/report.PDF` → `report-bilingual.pdf`
 *   - `https://host/path/` (no filename) → `document-bilingual.pdf`
 *   - Malformed URL → `document-bilingual.pdf`
 *
 * Exported for unit tests; not part of the component's public surface.
 */
export function deriveFilename(src: string): string {
  try {
    const pathname = new URL(src).pathname
    const lastSegment = pathname.split("/").filter(Boolean).pop() ?? ""
    const withoutExt = lastSegment.replace(/\.pdf$/i, "")
    const base = withoutExt.length > 0 ? withoutExt : "document"
    return `${base}-bilingual.pdf`
  }
  catch {
    return "document-bilingual.pdf"
  }
}
