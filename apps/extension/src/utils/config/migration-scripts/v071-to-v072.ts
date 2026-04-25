/**
 * Migration script from v071 to v072
 * - Drops the `pdfTranslation` config slice. The in-extension PDF translation
 *   feature (self-hosted pdf.js viewer + nav-hijack redirect + per-domain
 *   blocklist + file:// permission hint) was removed in favor of the public
 *   web translator at `getutranslate.com/document/`. The popup now opens that
 *   page with `?src=<active-tab-url>` instead of taking over the navigation.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

export function migrate(oldConfig: any): any {
  if (!oldConfig || typeof oldConfig !== "object")
    return oldConfig

  const { pdfTranslation: _dropped, ...rest } = oldConfig
  return rest
}
