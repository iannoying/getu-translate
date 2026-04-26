"use client"

/**
 * Right-aligned quota indicator. M6.4 ships with **mock numbers** so the
 * page renders for every visitor; M6.7 will wire it to the real
 * `billing.getEntitlements` quota field.
 */
export function QuotaBadge({
  used,
  limit,
  label,
}: {
  used: number
  limit: number | null
  label: string
}) {
  const text = limit == null ? `${used}` : `${used} / ${limit}`
  const ratio = limit == null ? 0 : used / limit
  const tone = ratio >= 0.9 ? "danger" : ratio >= 0.6 ? "warn" : "ok"
  return (
    <div className={`quota-badge tone-${tone}`} title={`${label}: ${text}`}>
      <span className="quota-badge-label">{label}</span>
      <span className="quota-badge-value">{text}</span>
    </div>
  )
}
