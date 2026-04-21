/**
 * Migration script from v067 to v068
 * - Adds bing-translate, yandex-translate as NON_API free providers
 * - Adds libre-translate as a free provider with endpoint + optional apiKey
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

const NEW_PROVIDERS = [
  {
    id: "bing-translate-default",
    enabled: true,
    name: "Bing Translate",
    provider: "bing-translate",
  },
  {
    id: "yandex-translate-default",
    enabled: true,
    name: "Yandex Translate",
    provider: "yandex-translate",
  },
  {
    id: "libre-translate-default",
    enabled: true,
    name: "LibreTranslate",
    provider: "libre-translate",
    endpoint: "",
  },
] as const

export function migrate(oldConfig: any): any {
  const existingProviders: any[] = Array.isArray(oldConfig?.providersConfig)
    ? oldConfig.providersConfig
    : []

  const existingProviderTypes = new Set(existingProviders.map((p: any) => p.provider))

  const newProviders = NEW_PROVIDERS.filter(p => !existingProviderTypes.has(p.provider))

  return {
    ...oldConfig,
    providersConfig: [...existingProviders, ...newProviders],
  }
}
