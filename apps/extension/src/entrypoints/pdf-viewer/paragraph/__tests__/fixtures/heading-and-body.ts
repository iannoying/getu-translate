import type { TextItem } from "../../types"

/**
 * 18-point heading followed by 11-point body paragraph. The font-size change
 * alone is enough to trigger a paragraph break even with tight vertical
 * spacing.
 *
 *   y=720  Section 3: Methodology         (font-size 18, bold-ish)
 *   y=694  We collected samples from        (font-size 11)
 *   y=681  three representative sites.
 */
export const headingAndBody: { items: TextItem[] } = {
  items: [
    {
      str: "Section 3: Methodology",
      transform: [18, 0, 0, 18, 72, 720],
      width: 210,
      height: 18,
      fontName: "g_d0_f2",
    },
    {
      str: "We collected samples from",
      transform: [11, 0, 0, 11, 72, 694],
      width: 145,
      height: 11,
      fontName: "g_d0_f1",
    },
    {
      str: "three representative sites.",
      transform: [11, 0, 0, 11, 72, 681],
      width: 138,
      height: 11,
      fontName: "g_d0_f1",
    },
  ],
}
