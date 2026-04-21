import { atom } from "jotai"
import { selectAtom } from "jotai/utils"
import { configAtom, configFieldsAtomMap } from "./config"

/**
 * Read-only view of the `pdfTranslation` config slice.
 *
 * Wraps `configAtom` with `selectAtom` so consumers only re-render when the
 * pdfTranslation sub-tree changes, not on any unrelated config write.
 */
export const pdfTranslationAtom = selectAtom(
  configAtom,
  config => config.pdfTranslation,
)

/**
 * Write-only atom that appends a normalized domain to
 * `pdfTranslation.blocklistDomains`.
 *
 * - Deduplicates case-insensitively against the existing list.
 * - Trims whitespace and lowercases before comparing / storing.
 * - On no-op cases (empty domain, already blocked) resolves immediately with
 *   `undefined` without triggering a storage write.
 * - Otherwise resolves after `writeConfigAtom` (via the per-slice
 *   `configFieldsAtomMap.pdfTranslation` writer) completes its optimistic
 *   update + storage persistence.
 */
export const addDomainToBlocklistAtom = atom(
  null,
  async (get, set, domain: string) => {
    const trimmed = domain.trim().toLowerCase()
    if (!trimmed)
      return

    const current = get(configAtom).pdfTranslation.blocklistDomains
    const alreadyBlocked = current.some(d => d.trim().toLowerCase() === trimmed)
    if (alreadyBlocked)
      return

    // `configFieldsAtomMap.pdfTranslation` is a per-slice writer atom produced
    // by `getConfigFieldAtom`, which accepts `Partial<PdfTranslationConfig>`
    // and forwards it through `writeConfigAtom` (deep-merged against current).
    await set(configFieldsAtomMap.pdfTranslation, {
      blocklistDomains: [...current, trimmed],
    })
  },
)
