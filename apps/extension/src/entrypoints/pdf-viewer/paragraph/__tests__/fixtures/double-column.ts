import type { TextItem } from "../../types"

/**
 * Two-column layout, 3 paragraphs per column. Column 1 starts at x=72,
 * column 2 at x=320. Within each column the paragraphs are separated by an
 * extra-tall vertical gap (~24 pt) compared to intra-paragraph spacing (12 pt).
 *
 * Items are intentionally shuffled in the array to simulate pdf.js's
 * reading-order traversal, which visits left column top-to-bottom then right
 * column top-to-bottom (the items appear in that natural order — no shuffle
 * applied beyond that here).
 *
 *   y=720  Left para 1 line 1.       Right para 1 line 1.
 *   y=708  Left para 1 line 2.       Right para 1 line 2.
 *   y=684  Left para 2 line 1.       Right para 2 line 1.
 *   y=672  Left para 2 line 2.       Right para 2 line 2.
 *   y=648  Left para 3 line 1.       Right para 3 line 1.
 *   y=636  Left para 3 line 2.       Right para 3 line 2.
 */
const L_X = 72
const R_X = 320

export const doubleColumn: { items: TextItem[] } = {
  items: [
    // Left column paragraph 1
    {
      str: "Left para 1 line 1.",
      transform: [11, 0, 0, 11, L_X, 720],
      width: 120,
      height: 11,
      fontName: "f",
    },
    {
      str: "Left para 1 line 2.",
      transform: [11, 0, 0, 11, L_X, 708],
      width: 120,
      height: 11,
      fontName: "f",
    },
    // Left column paragraph 2 (after ~24 pt gap)
    {
      str: "Left para 2 line 1.",
      transform: [11, 0, 0, 11, L_X, 684],
      width: 120,
      height: 11,
      fontName: "f",
    },
    {
      str: "Left para 2 line 2.",
      transform: [11, 0, 0, 11, L_X, 672],
      width: 120,
      height: 11,
      fontName: "f",
    },
    // Left column paragraph 3
    {
      str: "Left para 3 line 1.",
      transform: [11, 0, 0, 11, L_X, 648],
      width: 120,
      height: 11,
      fontName: "f",
    },
    {
      str: "Left para 3 line 2.",
      transform: [11, 0, 0, 11, L_X, 636],
      width: 120,
      height: 11,
      fontName: "f",
    },
    // Right column paragraph 1
    {
      str: "Right para 1 line 1.",
      transform: [11, 0, 0, 11, R_X, 720],
      width: 130,
      height: 11,
      fontName: "f",
    },
    {
      str: "Right para 1 line 2.",
      transform: [11, 0, 0, 11, R_X, 708],
      width: 130,
      height: 11,
      fontName: "f",
    },
    // Right column paragraph 2
    {
      str: "Right para 2 line 1.",
      transform: [11, 0, 0, 11, R_X, 684],
      width: 130,
      height: 11,
      fontName: "f",
    },
    {
      str: "Right para 2 line 2.",
      transform: [11, 0, 0, 11, R_X, 672],
      width: 130,
      height: 11,
      fontName: "f",
    },
    // Right column paragraph 3
    {
      str: "Right para 3 line 1.",
      transform: [11, 0, 0, 11, R_X, 648],
      width: 130,
      height: 11,
      fontName: "f",
    },
    {
      str: "Right para 3 line 2.",
      transform: [11, 0, 0, 11, R_X, 636],
      width: 130,
      height: 11,
      fontName: "f",
    },
  ],
}
