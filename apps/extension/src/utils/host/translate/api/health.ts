export type ProviderKind = "google" | "microsoft" | "bing" | "yandex" | "libre" | "deeplx"

export interface HealthOptions {
  now?: () => number
  windowMs?: number
  threshold?: number
  cooldownMs?: number
}

export function createHealthTracker(opts: HealthOptions = {}) {
  const now = opts.now ?? (() => Date.now())
  const windowMs = opts.windowMs ?? 60_000
  const threshold = opts.threshold ?? 3
  const cooldownMs = opts.cooldownMs ?? 30_000
  const failures = new Map<string, number[]>()
  const blockedUntil = new Map<string, number>()

  return {
    recordFailure(k: ProviderKind) {
      const t = now()
      const arr = (failures.get(k) ?? []).filter(ts => t - ts < windowMs)
      arr.push(t)
      failures.set(k, arr)
      if (arr.length >= threshold)
        blockedUntil.set(k, t + cooldownMs)
    },
    recordSuccess(k: ProviderKind) {
      failures.delete(k)
      blockedUntil.delete(k)
    },
    isHealthy(k: ProviderKind) {
      const until = blockedUntil.get(k)
      if (until == null)
        return true
      if (now() >= until) {
        blockedUntil.delete(k)
        failures.delete(k)
        return true
      }
      return false
    },
  }
}
