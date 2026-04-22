/**
 * Stable path + URL resolver for the Noto Sans CJK SC subset font used by the
 * bilingual PDF exporter (M3 PR#C Task 2).
 *
 * The actual font binary is **not** bundled here — see
 * `apps/extension/public/assets/fonts/README.md` for subsetting + drop-in
 * instructions. This module only provides:
 *
 *   - `CJK_FONT_PATH` — the stable in-extension path the font must live at
 *     (relative to the extension root; WXT copies `public/` verbatim to the
 *     built extension root, so this is also the filesystem path under
 *     `apps/extension/public/`).
 *   - `getCjkFontUrl()` — resolves `CJK_FONT_PATH` through
 *     `browser.runtime.getURL(...)` so the exporter can `fetch()` it at
 *     runtime (works from content scripts, the viewer, and the options page).
 *
 * Keeping this in a tiny dedicated module lets Task 2 import it without
 * pulling in the (much larger) pdf-lib writer, and makes the font path
 * trivially mockable in tests.
 */
import { browser } from "#imports"

/**
 * Extension-root-relative path to the subsetted Noto Sans CJK SC font.
 *
 * Must match the file dropped into `apps/extension/public/assets/fonts/` —
 * see the README in that directory for the exact subsetting recipe.
 */
export const CJK_FONT_PATH = "/assets/fonts/noto-sans-cjk-sc-subset.otf"

/**
 * Fully-qualified `chrome-extension://…/assets/fonts/…` URL for the CJK font.
 *
 * Use this with `fetch(...).then(r => r.arrayBuffer())` before passing the
 * bytes to `PDFDocument.embedFont(bytes, { subset: true })`.
 */
export function getCjkFontUrl(): string {
  return browser.runtime.getURL(CJK_FONT_PATH)
}
