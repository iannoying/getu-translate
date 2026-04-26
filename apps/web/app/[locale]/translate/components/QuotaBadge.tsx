"use client"

// Sentinel used by entitlements.ts for unlimited quotas. Consumers showing
// "∞" should check limit >= Number.MAX_SAFE_INTEGER.
const UNLIMITED = Number.MAX_SAFE_INTEGER

function displayLimit(limit: number): string {
  return limit >= UNLIMITED ? "∞" : String(limit)
}

export interface QuotaBucketData {
  used: number
  limit: number
}

/**
 * Right-aligned quota indicator wired to real entitlements data (M6.7).
 *
 * Shows "This month: N / L" for the web_text_translate_monthly bucket.
 * Hover tooltip shows all 3 web translate resource counts.
 *
 * Accepts the full quota map from billing.getEntitlements so the parent
 * doesn't need to do any reshaping — just pass `entitlements.quota`.
 */
export function QuotaBadge({
  quota,
  label,
  tooltipTemplate,
}: {
  quota: Record<string, QuotaBucketData>
  label: string
  /** Template with {textUsed} {textLimit} {tokenUsed} {tokenLimit} {pdfUsed} {pdfLimit} */
  tooltipTemplate: string
}) {
  const text = quota["web_text_translate_monthly"]
  const token = quota["web_text_translate_token_monthly"]
  const pdf = quota["web_pdf_translate_monthly"]

  // Primary display: request count. Fall back gracefully when quota not yet loaded.
  const used = text?.used ?? 0
  const limit = text?.limit ?? 100
  const displayText = `${used} / ${displayLimit(limit)}`

  const ratio = limit >= UNLIMITED ? 0 : used / limit
  const tone = ratio >= 0.9 ? "danger" : ratio >= 0.6 ? "warn" : "ok"

  const tooltip = tooltipTemplate
    .replace("{textUsed}", String(text?.used ?? 0))
    .replace("{textLimit}", displayLimit(text?.limit ?? 100))
    .replace("{tokenUsed}", String(token?.used ?? 0))
    .replace("{tokenLimit}", displayLimit(token?.limit ?? 0))
    .replace("{pdfUsed}", String(pdf?.used ?? 0))
    .replace("{pdfLimit}", displayLimit(pdf?.limit ?? 10))

  return (
    <div
      className={`quota-badge tone-${tone}`}
      title={tooltip}
      aria-label={`${label}: ${displayText}`}
    >
      <span className="quota-badge-label">{label}</span>
      <span className="quota-badge-value">{displayText}</span>
    </div>
  )
}
