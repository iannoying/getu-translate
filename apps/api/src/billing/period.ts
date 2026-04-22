import type { QuotaBucket } from "@getu/contract"

function utcYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function utcYm(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function periodKey(bucket: QuotaBucket, now: Date): string {
  if (bucket.endsWith("_daily")) return utcYmd(now)
  if (bucket.endsWith("_monthly")) return utcYm(now)
  return "lifetime"
}

export function periodResetIso(bucket: QuotaBucket, now: Date): string | null {
  if (bucket.endsWith("_daily")) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    return next.toISOString()
  }
  if (bucket.endsWith("_monthly")) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return next.toISOString()
  }
  return null
}
