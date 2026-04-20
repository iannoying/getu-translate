<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# ui

## Purpose

Project UI primitives layer. `base-ui/` mirrors the shadcn/ui catalog but re-implemented on top of `@base-ui/react` (Material-style unstyled primitives) plus Tailwind v4 tokens. The files at this level are higher-level composites that don't fit a single shadcn primitive: a tokenized insertable textarea for prompt authoring, two CodeMirror editors (CSS + JSON) wired to the project's theme provider and linters, and a generic `Tree` built on `@headless-tree/core`.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insertable-textarea.tsx` | Two components - `InsertableTextarea` (textarea with an imperative `insertTextAtCursor` ref handle that bypasses React's controlled-value tracker via the native HTMLTextArea setter) and `QuickInsertableTextarea` (the textarea + a row of token-chip buttons annotated with tooltips). Re-exports `InsertCell`/`InsertableTextareaHandle`/prop types. |
| `css-code-editor.tsx`     | `@uiw/react-codemirror` editor wired to `@codemirror/lang-css`, the project's `cssLinter`, color extension, and the active theme; styles error states via `hasError`.                                                                                                                                                                                    |
| `json-code-editor.tsx`    | Same pattern as the CSS editor with `@codemirror/lang-json` and a custom `allowEmptyJsonLinter` (the default `jsonParseLinter` throws on empty input).                                                                                                                                                                                                   |
| `tree.tsx`                | Generic `Tree` / `TreeItem` / `TreeItemLabel` / `TreeDragLine` built on `@headless-tree/core` `ItemInstance` API. Exposes an `indent` CSS variable, `chevron` vs `plus-minus` toggle icons, and `data-*` attributes for selection/drag state.                                                                                                            |

## Subdirectories

| Directory            | Purpose                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `base-ui/`           | Shadcn-style primitives wrapping `@base-ui/react` (button, badge, dialog, select, sheet, etc.). (see `base-ui/AGENTS.md`)   |
| `selection-popover/` | Custom resizable+draggable popover anchored to a text selection inside content scripts. (see `selection-popover/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- New shadcn-style primitives go in `base-ui/`, not here. Reserve this level for project-specific composites that aggregate several primitives or wrap third-party widgets (CodeMirror, headless-tree).
- `InsertableTextarea` deliberately uses `Object.getOwnPropertyDescriptor(...)?.set` to bypass React's controlled-input tracker. Do not "simplify" by setting `textarea.value` directly - React would silently swallow the change.
- CodeMirror wrappers must keep the inline monospace `style={{ fontSize, fontFamily }}` because `@uiw/react-codemirror` doesn't pick up Tailwind utilities for editor internals.
- Always read theme via `useTheme()` from `@/components/providers/theme-provider`; never read the Jotai atom directly so the editor can stay in sync with shadow-host themes.
- `Tree` accepts an opaque `tree` prop (`any`) because `@headless-tree/core` exposes a duck-typed instance; preserve the `typeof item.getProps === "function"` defensive checks - they keep the component safe when consumers forget to wire some adapters.

### Testing Requirements

- Vitest + `@testing-library/react`. Tests live in co-located `__tests__/` per primitive (see `selection-popover/__tests__`, `base-ui/__tests__`). Mock `@/components/providers/theme-provider#useTheme` for the editors, and stub `cssLinter` if you don't want CodeMirror to attach a real worker.

### Common Patterns

- Imperative handles via `useImperativeHandle` for components that must expose actions (e.g. `insertTextAtCursor`).
- Optional `hasError` prop drives `border-destructive` + `focus-within:ring-destructive` on container-only components (CodeMirror).
- Heavy components co-locate their hooks (`use-prevent-scroll-through`, `use-selection-popover-layout`) instead of dumping them into `@/hooks`.

## Dependencies

### Internal

- `@/components/providers/theme-provider#useTheme`.
- `@/components/ui/base-ui/*` (`button`, `textarea`, `tooltip`).
- `@/utils/css/lint-css#cssLinter`.
- `@/utils/styles/utils#cn`.

### External

- `@base-ui/react` - underlying primitives via `base-ui/`.
- `@uiw/react-codemirror` + `@codemirror/lang-css` + `@codemirror/lang-json` + `@codemirror/lint` + `@uiw/codemirror-extensions-color` - code editors.
- `@headless-tree/core` - tree state engine.
- `@radix-ui/react-slot` - `asChild` polymorphism in `Tree`.
- `@tabler/icons-react` - tree toggle icons.

<!-- MANUAL: -->
