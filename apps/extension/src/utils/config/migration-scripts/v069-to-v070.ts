/**
 * Migration script from v069 to v070
 * - Adds `pdfTranslation` config slice so the new PDF bilingual viewer has
 *   somewhere to persist its activation mode, per-domain blocklist, and
 *   file:// permission hint.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    pdfTranslation: oldConfig?.pdfTranslation ?? {
      enabled: true,
      activationMode: "ask",
      blocklistDomains: [],
      allowFileProtocol: false,
    },
  }
}
