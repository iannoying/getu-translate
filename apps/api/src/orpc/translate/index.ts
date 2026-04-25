import { documentRouter } from "./document"
import { textRouter } from "./text"

/**
 * Web /translate & /document oRPC routes.
 *
 *   translate.text          — single text translation (one model column)
 *   translate.saveHistory   — persist a complete translation row
 *   translate.listHistory   — paginated history for the user
 *
 *   translate.document.create — create a PDF job (front-end has uploaded R2)
 *   translate.document.status — poll a job's state
 *   translate.document.list   — paginated PDF job history
 */
export const translateRouter = {
  ...textRouter,
  document: documentRouter,
}
