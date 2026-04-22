import { Entity } from "dexie"

/**
 * Daily rolling counter of successfully translated PDF pages. Keyed by
 * the local-timezone date (YYYY-MM-DD) so the Free-tier 50-page/day quota
 * resets at midnight in the user's wall clock.
 *
 * Mirrors `InputTranslationUsage` exactly: the M3 quota UI reads the same
 * shape, and we keep the two tables separate so input vs. PDF budgets can
 * evolve independently.
 */
export default class PdfTranslationUsage extends Entity {
  dateKey!: string
  count!: number
  updatedAt!: Date
}
