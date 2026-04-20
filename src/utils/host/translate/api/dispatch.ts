import type { ProviderKind } from "./health"
import { translateBing } from "./bing"
import { googleTranslate } from "./google"
import { createHealthTracker } from "./health"
import { microsoftTranslate } from "./microsoft"
import { translateYandex } from "./yandex"

export interface FreeTranslateInput { text: string, from: string, to: string }
export interface FreeTranslateOutput { text: string }

export type FreeTranslateImpl = (input: FreeTranslateInput) => Promise<FreeTranslateOutput>

export interface DispatchOptions {
  order: ProviderKind[]
  impls: Partial<Record<ProviderKind, FreeTranslateImpl>>
  health?: {
    isHealthy: (k: ProviderKind) => boolean
    recordSuccess: (k: ProviderKind) => void
    recordFailure: (k: ProviderKind) => void
  }
}

export interface DispatchResult extends FreeTranslateOutput {
  usedProvider: ProviderKind
}

export async function dispatchFreeTranslate(
  input: FreeTranslateInput,
  opts: DispatchOptions,
): Promise<DispatchResult> {
  let lastError: Error | undefined

  for (const k of opts.order) {
    // Skip if health tracker says unhealthy
    if (opts.health && !opts.health.isHealthy(k))
      continue

    const impl = opts.impls[k]

    // Skip if no impl registered for this provider
    if (!impl)
      continue

    try {
      const result = await impl(input)
      opts.health?.recordSuccess(k)
      return { ...result, usedProvider: k }
    }
    catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      opts.health?.recordFailure(k)
    }
  }

  if (lastError) {
    throw new Error(`All free providers failed: ${lastError.message}`)
  }

  throw new Error("No available free translation provider")
}

// Default singleton health tracker — shared across calls; override in tests
export const defaultHealth = createHealthTracker()

const googleAdapter: FreeTranslateImpl = async (input) => {
  const text = await googleTranslate(input.text, input.from, input.to)
  return { text }
}

const microsoftAdapter: FreeTranslateImpl = async (input) => {
  const text = await microsoftTranslate(input.text, input.from, input.to)
  return { text }
}

export const defaultImpls: Partial<Record<ProviderKind, FreeTranslateImpl>> = {
  google: googleAdapter,
  microsoft: microsoftAdapter,
  bing: input => translateBing(input),
  yandex: input => translateYandex(input),
  // libre and deeplx need runtime config — caller supplies them
}

/**
 * Default provider try-order for free translation.
 *
 * LibreTranslate and DeepLX require runtime configuration (endpoint / api key)
 * and must be explicitly added by the caller when configured, e.g.
 * `[...DEFAULT_ORDER, 'libre']` after injecting `libre` into impls.
 */
export const DEFAULT_ORDER: ProviderKind[] = ["google", "microsoft", "bing", "yandex"]
