<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# css

## Purpose

CSS validation for user-authored CSS in the options page (custom translation node styles, custom prompt page CSS, etc.). Provides both a standalone `lintCSS(string)` validator and a CodeMirror `linter` extension that surfaces parse errors as red squiggles in the editor.

## Key Files

| File          | Description                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-css.ts` | `lintCSS(css)` — runs `csstree.parse` with all sub-parsers enabled and collects every `onParseError` into `{ line, column, message, severity }`. `cssLinter()` adapts those errors to `@codemirror/lint` `Diagnostic`s, highlighting up to 10 chars from the error column. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **css-tree is permissive by design** — it can recover from many syntactic mistakes. Reporting goes through `onParseError` rather than throwing, so always treat `errors.length > 0` as "invalid".
- The `try/catch` around `csstree.parse` catches the rare totally-fatal error (e.g. unbalanced braces with no recovery point); both paths funnel into the same `errors` array.
- The CodeMirror extension converts 1-based `line/column` from css-tree into a 0-based document offset via `view.state.doc.line(error.line)`; do not change indexing without re-checking both ends.
- This module is editor-only; do not import it into background or content-script paths — `@codemirror/*` pulls in unnecessary KB.

### Testing Requirements

- No co-located tests today. Add Vitest specs under `__tests__/` if you change the parser-options or error-shape mapping.

### Common Patterns

- Same "pure validator + framework adapter" split used in other linters; export the validator standalone so it can be reused outside the editor (e.g. on save).

## Dependencies

### Internal

None — leaf module.

### External

- `css-tree` — parser with `parseAtrulePrelude`, `parseRulePrelude`, `parseValue`, `parseCustomProperty` all enabled.
- `@codemirror/lint`, `@codemirror/view` — editor integration only.

<!-- MANUAL: -->
