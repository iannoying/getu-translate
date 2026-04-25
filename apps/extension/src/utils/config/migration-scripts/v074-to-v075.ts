/**
 * Migration script from v074 to v075
 * - Renames the GetU Pro Gemini 3 Flash display label from
 *   `Gemini-3-flash-preview` to `Gemini-3-flash`.
 * - Defensively drops `pdfTranslation` for local test builds created before
 *   the v071 -> v072 production migration was rebased.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

export function migrate(oldConfig: any): any {
  if (!oldConfig || typeof oldConfig !== "object")
    return oldConfig

  const { pdfTranslation: _dropped, ...rest } = oldConfig

  const providersConfig = Array.isArray(rest.providersConfig)
    ? rest.providersConfig.map((provider: any) => {
        if (
          provider?.id !== "getu-pro-gemini-3-flash-preview"
          || provider?.name !== "Gemini-3-flash-preview"
        ) {
          return provider
        }

        return {
          ...provider,
          name: "Gemini-3-flash",
        }
      })
    : rest.providersConfig

  return {
    ...rest,
    providersConfig,
  }
}
