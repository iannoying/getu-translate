import { useQuery } from "@tanstack/react-query"
import { sendMessage } from "@/utils/message"

export type FeatureFlagValue = boolean | string | undefined

interface UseFeatureFlagResult {
  value: FeatureFlagValue
  isLoading: boolean
  isEnabled: boolean
}

/**
 * Read a PostHog feature flag via the background analytics runtime.
 *
 * Returns `undefined` while the flag is still loading, when analytics is
 * disabled, when PostHog is not configured, or when the flag does not exist.
 * `isEnabled` is a convenience: true only when the flag value is strictly
 * `true` or a non-empty string (multivariate).
 *
 * @param key Flag key as configured in PostHog.
 * @param defaultValue Fallback returned until the query resolves.
 */
export function useFeatureFlag(
  key: string,
  defaultValue: FeatureFlagValue = undefined,
): UseFeatureFlagResult {
  const query = useQuery({
    queryKey: ["feature-flag", key],
    queryFn: async (): Promise<FeatureFlagValue> => {
      return sendMessage("getFeatureFlag", { key })
    },
    // Flags rarely change in-session; stale-after-5-min is a reasonable default.
    staleTime: 5 * 60_000,
  })

  const value = query.data ?? defaultValue
  return {
    value,
    isLoading: query.isLoading,
    isEnabled: value === true || (typeof value === "string" && value.length > 0),
  }
}
