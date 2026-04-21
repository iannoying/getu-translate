<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# form

## Purpose

Reusable form-field adapters that bind `@tanstack/react-form` field state to the project's `ui/base-ui` primitives. Each component pulls the field via `useFieldContext`, subscribes to `state.meta.errors` through `useStore`, and renders inside a `Field`/`FieldLabel`/`FieldError` wrapper. "Auto-save" variants additionally call `formForSubmit.handleSubmit()` on every change so settings panels can persist edits without a Save button.

## Key Files

| File                                            | Description                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `form-context.ts`                               | Exports `fieldContext`/`formContext`/`useFieldContext`/`useFormContext` from `createFormHookContexts()`; the foundation every other field imports. |
| `input-field.tsx`                               | Text/number `<Input>` field. Number inputs coerce via `Number(value)` and emit `undefined` for empty strings.                                      |
| `input-field-auto-save.tsx`                     | Same as `input-field.tsx` but accepts `formForSubmit` and triggers `handleSubmit()` on each `onChange`.                                            |
| `select-field.tsx`                              | Wraps `ui/base-ui/select#Select`; only forwards string values via `handleValueChange`.                                                             |
| `select-field-auto-save.tsx`                    | Auto-save twin of `select-field.tsx`.                                                                                                              |
| `quick-insertable-textarea-field.tsx`           | Binds the `QuickInsertableTextarea` (textarea + insertable token chips) into the form.                                                             |
| `quick-insertable-textarea-field-auto-save.tsx` | Auto-save variant of the insertable textarea field.                                                                                                |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- These are field-level adapters - they MUST be rendered inside a `<formApi.AppField name="...">` (or equivalent) so `useFieldContext` resolves; otherwise it throws.
- Numeric inputs go through `type="number"` branch in `input-field.tsx`; preserve the empty-string -> `undefined` behavior so Zod schemas with `.optional()` keep working.
- For auto-save behavior, prefer wrapping the form-level `useStore` debouncing in the parent rather than mutating these components - they intentionally fire on every change.
- `FieldLabel` is rendered with `nativeLabel={false} render={<div />}` so the label is decoupled from the input id; keep that pattern when adding new fields to avoid double-`<label>` semantics inside complex layouts.
- New fields belong here only if they share the `Field`/`FieldError`/`useFieldContext` triad; one-off composites should live next to their feature.

### Testing Requirements

- Vitest + `@testing-library/react`. Wrap tests in a `createFormHook`/`AppField` harness so `useFieldContext` resolves. Drive change/blur with `userEvent` and assert that `field.state.value` and `state.meta.errors` flow through to `FieldError`.

### Common Patterns

- `useStore(field.store, state => state.meta.errors)` to subscribe to validation messages without re-rendering on every keystroke.
- `aria-invalid={hasError}` mirrored on the input + `<Field invalid={hasError}>` wrapper for consistent base-ui styling.
- Auto-save fields take a `formForSubmit: { handleSubmit: () => void }` prop, deliberately typed loose so any TanStack form/sub-form can satisfy it.
- Errors are joined into a comma-separated string accepting either string errors or `{ message }` objects (Zod-style).

## Dependencies

### Internal

- `@/components/ui/base-ui/field` (`Field`, `FieldLabel`, `FieldError`).
- `@/components/ui/base-ui/input`, `select`.
- `@/components/ui/insertable-textarea` (`QuickInsertableTextarea`, `InsertCell`).

### External

- `@tanstack/react-form` - `createFormHookContexts`, `useStore`.

<!-- MANUAL: -->
