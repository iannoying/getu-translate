import type { TextItem } from "../../types"

/**
 * Three lines of the same paragraph at font size 12, line spacing 14,
 * left-aligned at x=72 (1 inch margin). Baseline y decreases by 14 per line.
 *
 * Page layout (ASCII, not to scale):
 *
 *   y=700  The quick brown fox jumps
 *   y=686  over the lazy dog while
 *   y=672  the owl watches silently.
 */
export const simpleParagraph: { items: TextItem[] } = {
  items: [
    {
      str: "The quick brown fox jumps",
      transform: [12, 0, 0, 12, 72, 700],
      width: 140,
      height: 12,
      fontName: "g_d0_f1",
    },
    {
      str: "over the lazy dog while",
      transform: [12, 0, 0, 12, 72, 686],
      width: 124,
      height: 12,
      fontName: "g_d0_f1",
    },
    {
      str: "the owl watches silently.",
      transform: [12, 0, 0, 12, 72, 672],
      width: 132,
      height: 12,
      fontName: "g_d0_f1",
    },
  ],
}
