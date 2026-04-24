<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-24 -->

# input-translation

## Purpose

The in-place translator for editable `<input>` / `<textarea>` / `contenteditable` fields. Triggered via pluggable triggers (triple-space, configurable hotkey, etc. — see `triggers/`). On fire, the hook replaces the field's text with its translation using `document.execCommand("insertText", ...)` (preserving native Ctrl+Z undo) and shows a small CSS spinner pinned to the right edge of the field. Optional cycle mode swaps `fromLang`/`toLang` on every other run, persisted via `sessionStorage` so consecutive cycles ping-pong between languages. Free-tier users are quota-limited via `quota/`.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-input-translation.ts` | The `useInputTranslation()` hook — installs the active trigger, runs password-field skip, dispatches framework-compatible input events, undo-friendly text replacement, single-flight `isTranslatingRef` guard, post-translation race check that aborts if the user typed during the network call, and consults the quota gate before firing. |

(Note: `index.ts` is a one-line re-export and is intentionally omitted.)

## Subdirectories

| Directory   | Purpose                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `triggers/` | Pluggable input-translation triggers (triple-space, hotkey). Each trigger module registers its detection pattern and yields a "fire" callback.     |
| `quota/`    | Free-tier daily quota counter backed by the `inputTranslationUsage` Dexie table; blocks firing past the limit and surfaces the upgrade CTA.        |

## For AI Agents

### Working In This Directory

- The keydown listener is attached at capture phase (`document.addEventListener(..., true)`) so it fires before site-level handlers; preserve that.
- The third trigger is determined by checking that **all** consecutive timestamps in the buffer are within `timeThreshold` of each other, not just the first and last — keep the per-pair check.
- Password fields (`HTMLInputElement` with `type === "password"`) are explicitly skipped for security; do not loosen this without security review.
- Translation is performed via `translateTextForInput` from `@/utils/host/translate/translate-variants` — that function owns provider selection and prompt formatting, this hook only manages UX.
- `setTextWithUndo` selects all then `execCommand("insertText", ...)` — `execCommand` is deprecated but is the only way to keep native undo working; do not "modernize" by directly assigning `value`.
- The spinner uses inline styles with `!important` everywhere so host-page CSS cannot hide it; honor `prefers-reduced-motion` by leaving the spinner static (not removed).
- After the async translate, re-read the field's value/textContent and only apply if the original text is unchanged — this is the only thing preventing the translator from clobbering the user's edits during a slow network call.

### Testing Requirements

- No co-located tests for this hook today. Behavior should be covered through manual QA on real input/textarea/contenteditable elements; if you add a Vitest spec, mock `translateTextForInput`, `sessionStorage`, and use `userEvent.keyboard("[Space]")` triplets.
- Run the broader suite via `pnpm test`. `SKIP_FREE_API=true` does not affect this hook.

### Common Patterns

- Hot-key debounce via a `Ref<number[]>` of timestamps trimmed by max age (`timeThreshold * (TRIGGER_COUNT - 1)`).
- Imperative spinner appended to `document.body` instead of a portal so it survives any in-page React unmounts and stays positioned to the input element via `getBoundingClientRect()` + `scrollX/Y`.
- `sessionStorage`-backed cycle state (`read-frog-input-translation-last-cycle-swapped`) so the swap survives across translations within a tab session but resets per tab.
- Single-flight pattern via `isTranslatingRef` to ignore additional triple-space triggers while a translation is in flight.
- Race protection: capture `originalText`, await the translation, re-read the live value, only commit when they match.

## Dependencies

### Internal

- `@/utils/atoms/config` — `configFieldsAtomMap.inputTranslation` for `enabled`, `fromLang`, `toLang`, `enableCycle`, `timeThreshold`.
- `@/utils/host/translate/translate-variants` — `translateTextForInput` (variant of the translator with input-specific prompts).
- `@/utils/analytics` — `createFeatureUsageContext`, `trackFeatureAttempt` (records `INPUT_TRANSLATION` attempts).
- `@/types/analytics` — `ANALYTICS_FEATURE`, `ANALYTICS_SURFACE` enums.

### External

- `react` — `useAtom`, `useCallback`, `useEffect`, `useRef`.
- `jotai` — `useAtom` for the input-translation config slice.
- DOM Web APIs: `document.execCommand`, `Element.animate` (Web Animations API), `window.matchMedia("(prefers-reduced-motion: reduce)")`.

<!-- MANUAL: -->
