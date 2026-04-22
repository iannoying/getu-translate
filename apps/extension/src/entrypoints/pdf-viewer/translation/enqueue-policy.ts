/**
 * Enqueue policy for the translation scheduler (PR #B2 Task 5).
 *
 * `main.ts` gates scheduler `enqueue()` calls behind a small mutable policy
 * ref. This module is the pure piece: it answers "given a user-configured
 * `activationMode`, what initial policy should the scheduler start in?"
 *
 * Decision table
 * --------------
 *   - `"always"`  → `"enabled"`   : translate-on-sight, no toast gate.
 *   - `"ask"`     → `"blocked"`   : wait for the first-use toast's Accept
 *                                    click to flip the policy to `"enabled"`.
 *   - `"manual"`  → `"blocked"`   : auto-translation never runs; popup /
 *                                    button path handles activation (out of
 *                                    scope for B2).
 *
 * Keeping this as a pure function lets us unit-test the decision surface
 * independently of the module-level mutable ref in `main.ts`.
 */
import type { PdfTranslationConfig } from "@/types/config/config"

/**
 * Subset of `PdfTranslationConfig["activationMode"]` we care about here.
 * Typed via the existing config inference so a future enum addition flows
 * through without a silent mismatch.
 */
export type ActivationMode = PdfTranslationConfig["activationMode"]

export type EnqueuePolicy = "blocked" | "enabled"

/**
 * Map an activation mode to the scheduler's starting enqueue policy.
 *
 * The returned value is the *initial* state; runtime transitions (e.g. the
 * toast's Accept handler flipping `"ask"` from `"blocked"` to `"enabled"`)
 * happen in the caller via direct mutation of the policy ref.
 */
export function decideInitialPolicy(activationMode: ActivationMode): EnqueuePolicy {
  return activationMode === "always" ? "enabled" : "blocked"
}
