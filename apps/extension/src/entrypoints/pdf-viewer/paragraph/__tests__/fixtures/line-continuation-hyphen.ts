import type { TextItem } from "../../types"

/**
 * A single paragraph whose second line begins with the suffix of a word
 * hyphenated at the end of the first line (`under-` + `standing` →
 * `understanding`). The join should drop the trailing hyphen and glue the
 * next word directly, without inserting a space.
 *
 *   y=700  Deep reading requires under-
 *   y=686  standing of the subject matter.
 */
export const lineContinuationHyphen: { items: TextItem[] } = {
  items: [
    {
      str: "Deep reading requires under-",
      transform: [12, 0, 0, 12, 72, 700],
      width: 175,
      height: 12,
      fontName: "g_d0_f1",
    },
    {
      str: "standing of the subject matter.",
      transform: [12, 0, 0, 12, 72, 686],
      width: 180,
      height: 12,
      fontName: "g_d0_f1",
    },
  ],
}
