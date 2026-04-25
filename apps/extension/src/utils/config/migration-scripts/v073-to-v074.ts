/**
 * Migration script from v073 to v074
 * - Renames the GetU Pro GPT display label from `Gpt-5.5` to `GPT-5.5`.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

export function migrate(oldConfig: any): any {
  const providersConfig = Array.isArray(oldConfig?.providersConfig)
    ? oldConfig.providersConfig.map((provider: any) => {
        if (provider?.id !== "getu-pro-gpt-55" || provider?.name !== "Gpt-5.5") {
          return provider
        }

        return {
          ...provider,
          name: "GPT-5.5",
        }
      })
    : oldConfig?.providersConfig

  return {
    ...oldConfig,
    providersConfig,
  }
}
