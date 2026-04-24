import * as React from "react"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"

export interface FirstUseToastProps {
  /**
   * Called when the user clicks "Translate this PDF".
   * `main.ts` wires this to flip the translation enqueue policy from
   * `"blocked"` to `"enabled"` and retroactively schedule every known
   * paragraph on already-rendered pages (PR #B2 Task 5).
   */
  onAccept: () => void
  /** Called when the user clicks "Not this time" — closes toast, no persistence. */
  onSkipOnce: () => void
  /**
   * Called when the user clicks "Never on this site".
   * Must write the current document's domain into `pdfTranslation.blocklistDomains`
   * and resolve once persistence is complete so the caller can reload.
   */
  onNever: () => void | Promise<void>
}

/**
 * First-use activation toast shown inside the pdf-viewer entrypoint.
 *
 * Rendered when `pdfTranslation.activationMode === "ask"` AND the domain is
 * not already in `blocklistDomains`. The toast offers three choices:
 *
 *   - Translate this PDF     — close toast, enable the translation scheduler for this file.
 *   - Not this time          — close toast, no persistence (session-only).
 *   - Never on this site     — persist domain to blocklist, then reload.
 *
 * Copy is routed through `i18n.t("pdfViewer.firstUseToast.*")`; English is the
 * source of truth, other locales fall back to English until translated.
 */
export function FirstUseToast({
  onAccept,
  onSkipOnce,
  onNever,
}: FirstUseToastProps) {
  const [open, setOpen] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)
  // Keep the latest onSkipOnce callback in a ref so the Escape-key effect
  // below only depends on `open` — avoids re-binding the window listener on
  // every render while still calling the freshest handler.
  const onSkipOnceRef = useRef(onSkipOnce)
  useEffect(() => {
    onSkipOnceRef.current = onSkipOnce
  }, [onSkipOnce])

  const title = i18n.t("pdfViewer.firstUseToast.title")
  const description = i18n.t("pdfViewer.firstUseToast.description")
  const translateLabel = i18n.t("pdfViewer.firstUseToast.accept")
  const skipLabel = i18n.t("pdfViewer.firstUseToast.skipOnce")
  const neverLabel = i18n.t("pdfViewer.firstUseToast.neverOnThisDomain")

  const handleTranslate = () => {
    // Hide the toast UI immediately; the injected `onAccept` handler (wired
    // in `main.ts`) flips the translation enqueue policy to `"enabled"` and
    // retroactively schedules translation for every page already rendered.
    setOpen(false)
    onAccept()
  }

  const handleSkipOnce = () => {
    setOpen(false)
    onSkipOnce()
  }

  const handleNever = async () => {
    if (busy)
      return
    setBusy(true)
    try {
      await onNever()
    }
    finally {
      // setOpen(false) unmounts the toast — once unmounted, `busy` is no
      // longer observable, so we skip the redundant setBusy(false).
      setOpen(false)
    }
  }

  // Auto-focus the primary (Translate) button when the toast appears so
  // keyboard users don't have to tab in from the PDF pane.
  useEffect(() => {
    if (open)
      primaryButtonRef.current?.focus()
  }, [open])

  // Escape key dismisses the toast via the same path as "Not this time".
  // Note: we intentionally don't call stopPropagation — pdf.js keyboard
  // shortcuts on the underlying viewer keep working.
  useEffect(() => {
    if (!open)
      return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        onSkipOnceRef.current()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  if (!open)
    return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-first-use-title"
      aria-describedby="pdf-first-use-description"
      data-testid="pdf-first-use-toast"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2147483647,
        maxWidth: 360,
        padding: 16,
        borderRadius: 12,
        background: "#ffffff",
        color: "#111",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <div
        id="pdf-first-use-title"
        style={{ fontWeight: 600, marginBottom: 4 }}
      >
        {title}
      </div>
      <div
        id="pdf-first-use-description"
        style={{ color: "#555", marginBottom: 12 }}
      >
        {description}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleNever}
          disabled={busy}
          data-testid="pdf-first-use-never"
        >
          {neverLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSkipOnce}
          disabled={busy}
          data-testid="pdf-first-use-skip"
        >
          {skipLabel}
        </Button>
        <Button
          ref={primaryButtonRef}
          type="button"
          size="sm"
          onClick={handleTranslate}
          disabled={busy}
          data-testid="pdf-first-use-accept"
        >
          {translateLabel}
        </Button>
      </div>
    </div>
  )
}
