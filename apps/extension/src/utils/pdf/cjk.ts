/**
 * CJK detection helper for PDF export (M3 PR#C).
 *
 * Used by the bilingual PDF exporter (`pdf-lib-writer`) to decide whether the
 * translated paragraph text needs a CJK-capable font (Noto Sans CJK) or can
 * safely be drawn with a Latin-only standard font (Helvetica).
 *
 * The ranges below cover the common CJK scripts we care about:
 *   - CJK Unified Ideographs (Chinese/Japanese Kanji/Hanja)
 *   - CJK Unified Ideographs Extension A (rarer CJK)
 *   - Hiragana + Katakana (Japanese kana)
 *   - Hangul Syllables (Korean)
 *   - Halfwidth + Fullwidth Forms (fullwidth ASCII + halfwidth kana)
 *
 * We deliberately skip CJK Extension B+ (outside the BMP, rare in typical
 * documents) and the full Hangul Jamo range; the subset font we plan to ship
 * covers the ranges above and that's the right scope to trigger on.
 */

/**
 * Inclusive unicode ranges that should be treated as CJK for font selection.
 */
export const CJK_RANGES = [
  [0x4E00, 0x9FFF], // CJK Unified Ideographs
  [0x3400, 0x4DBF], // CJK Unified Ideographs Extension A
  [0x3040, 0x309F], // Hiragana
  [0x30A0, 0x30FF], // Katakana
  [0xAC00, 0xD7AF], // Hangul Syllables
  [0xFF00, 0xFFEF], // Halfwidth + Fullwidth Forms
] as const

/**
 * `true` if `text` contains at least one CJK code point in `CJK_RANGES`.
 *
 * Iterates by code point (not UTF-16 code unit) so astral characters are
 * handled correctly, even though the current ranges are all in the BMP.
 */
export function containsCJK(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    for (const [start, end] of CJK_RANGES) {
      if (code >= start && code <= end) {
        return true
      }
    }
  }
  return false
}
