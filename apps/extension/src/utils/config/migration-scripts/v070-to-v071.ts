/**
 * Migration script from v070 to v071
 * - Inserts the default `getu-pro` provider entry at position 0 of
 *   `providersConfig` if not already present.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

const GETU_PRO_DEFAULT_ENTRY = {
  id: "getu-pro-default",
  name: "GetU Translate Pro",
  description: "AI translations powered by your GetU Pro subscription.",
  enabled: true,
  provider: "getu-pro",
  model: {
    model: "gpt-4o-mini",
    isCustomModel: false,
    customModel: null,
  },
} as const

export function migrate(oldConfig: any): any {
  const providers: any[] = Array.isArray(oldConfig?.providersConfig) ? oldConfig.providersConfig : []
  const alreadyPresent = providers.some((p: any) => p?.provider === "getu-pro")
  return {
    ...oldConfig,
    providersConfig: alreadyPresent ? providers : [GETU_PRO_DEFAULT_ENTRY, ...providers],
  }
}
