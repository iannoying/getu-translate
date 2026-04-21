import { Entity } from "dexie"

/**
 * Daily rolling counter of successful input-field translations. Keyed by the
 * local-timezone date (YYYY-MM-DD) so the counter resets at midnight in the
 * user's wall clock, matching how a 50-per-day quota would be perceived.
 *
 * One row per calendar day. Old rows are harmless and can be pruned lazily;
 * we do not expire them automatically since the table is tiny (≤ 366 rows).
 */
export default class InputTranslationUsage extends Entity {
  dateKey!: string
  count!: number
  updatedAt!: Date
}
