import type { ProviderConfig } from "@/types/config/provider"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef } from "react"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { entitlementsAtom } from "@/utils/atoms/entitlements"

/**
 * Side-effect hook: when the entitlements tier transitions from 'pro' → 'free',
 * disable the getu-pro provider entry in the providers config so the user does
 * not continue sending requests through the Pro virtual provider.
 *
 * Mount this once at a top-level component that has access to Jotai and the
 * queryClient (e.g. the popup App component).
 */
export function useProExpiryEffect() {
  const ent = useAtomValue(entitlementsAtom)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const setProvidersConfig = useSetAtom(configFieldsAtomMap.providersConfig)
  const prevTierRef = useRef<string | null>(null)

  useEffect(() => {
    const now = ent?.tier ?? null
    if (prevTierRef.current === "pro" && now === "free") {
      const current = providersConfig ?? []
      const updated: ProviderConfig[] = current.map((provider) => {
        if (provider.provider === "getu-pro" && provider.enabled) {
          return { ...provider, enabled: false }
        }
        return provider
      })
      // Only write if something actually changed
      const changed = updated.some((p, i) => p !== current[i])
      if (changed) {
        void setProvidersConfig(updated)
      }
    }
    prevTierRef.current = now
  }, [ent?.tier, providersConfig, setProvidersConfig])
}
