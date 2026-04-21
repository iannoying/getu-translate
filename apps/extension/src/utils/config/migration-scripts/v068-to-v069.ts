/**
 * Migration script from v068 to v069
 * - Adds `triggerMode` and `tokenPrefix` to `inputTranslation` so users can
 *   opt into the immersive-style `//en ` token trigger. Default keeps
 *   existing users on the triple-space behavior they already know.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

export function migrate(oldConfig: any): any {
  const existing = oldConfig?.inputTranslation ?? {}
  return {
    ...oldConfig,
    inputTranslation: {
      ...existing,
      triggerMode: existing.triggerMode ?? "triple-space",
      tokenPrefix: existing.tokenPrefix ?? "//",
    },
  }
}
