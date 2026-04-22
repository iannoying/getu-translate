import type { TextItem } from "../../types"

/**
 * Two paragraphs separated by a blank-line gap (~28 pt vs normal 14 pt line
 * spacing). Both at font size 12.
 *
 *   y=700  Paragraph one begins here with a
 *   y=686  statement worth translating first.
 *
 *   (blank line)
 *
 *   y=658  Paragraph two starts after a gap
 *   y=644  of vertical space above it.
 */
export const multipleParagraphs: { items: TextItem[] } = {
  items: [
    {
      str: "Paragraph one begins here with a",
      transform: [12, 0, 0, 12, 72, 700],
      width: 170,
      height: 12,
      fontName: "g_d0_f1",
    },
    {
      str: "statement worth translating first.",
      transform: [12, 0, 0, 12, 72, 686],
      width: 175,
      height: 12,
      fontName: "g_d0_f1",
    },
    {
      str: "Paragraph two starts after a gap",
      transform: [12, 0, 0, 12, 72, 658],
      width: 170,
      height: 12,
      fontName: "g_d0_f1",
    },
    {
      str: "of vertical space above it.",
      transform: [12, 0, 0, 12, 72, 644],
      width: 140,
      height: 12,
      fontName: "g_d0_f1",
    },
  ],
}
