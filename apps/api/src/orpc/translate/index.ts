import { documentRouter } from "./document"
import { textRouter } from "./text"

/**
 * Web /translate & /document oRPC routes.
 *
 *   translate.translate      — single text translation (one model column)
 *   translate.saveHistory    — persist a complete translation row
 *   translate.listHistory    — paginated history for the user
 *   translate.deleteHistory  — delete a single history row (M6.6)
 *   translate.clearHistory   — wipe all history rows (M6.6)
 *
 *   translate.document.create — create a PDF job (front-end has uploaded R2)
 *   translate.document.status — poll a job's state
 *   translate.document.list   — paginated PDF job history
 */
export const translateRouter = {
  ...textRouter,
  document: documentRouter,
}
