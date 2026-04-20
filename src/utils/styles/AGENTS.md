<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# styles

## Purpose

Tiny styling layer with two unrelated concerns: a `cn()` Tailwind merger that knows about Read Frog's custom `floating` shadow theme, and a PostCSS plugin that rewrites every `--tw-*` custom property (declarations, `@property`, and `var(...)` references) to a `--rf-tw-*` namespace. The rename is what stops Tailwind v4's runtime variables from colliding with host-page Tailwind installations when our content-script CSS leaks into the document for `@property`/`@font-face` rules.

## Key Files

| File                              | Description                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils.ts`                        | `cn(...inputs)` — `clsx` + `tailwind-merge` extended so the conflict resolver knows our `shadow-floating` utility variant exists. Use everywhere Tailwind classes are conditionally combined.                                                                                                                                                                                                           |
| `postcss-rename-custom-props.cjs` | Custom PostCSS plugin (`postcssPlugin: "postcss-rename-custom-props"`) — rewrites `@property --tw-…` rules, declarations whose `prop` starts with `--tw-`, and `var(--tw-…)` references inside any value (recursing into nested `calc()`/`color-mix()`). Defaults `--tw-` → `--rf-tw-`; configurable via `{ fromPrefix, toPrefix }`. Wired into the build's PostCSS pipeline (see project root config). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Use `cn()`, never `clsx + twMerge` directly.** Direct `tailwind-merge` doesn't know about `shadow-floating`, and you'll get the wrong "last-wins" behavior on `shadow-*` utilities.
- The `.cjs` extension on the PostCSS plugin is required: PostCSS loads plugins via CommonJS in this build. Do not convert it to ESM without also updating the loader config.
- The plugin uses `postcss-value-parser` to walk values so it correctly leaves arbitrary CSS function arguments alone and only renames the first `word` inside `var(...)`. Don't switch to a regex — nested functions and edge cases (multiple vars, fallbacks) will silently break.
- If you ever need a third namespace (e.g. for an isolated subtree), call the plugin with `{ fromPrefix, toPrefix }` rather than forking the file.
- The rename happens at build time — runtime CSS injected through `react-shadow-host/css-registry.ts` is already-rewritten output, so nothing in `src/utils/` needs to perform the rewrite again.

### Testing Requirements

- No co-located tests today. When changing the plugin, fixture an input CSS string with declarations, `@property`, nested `var()`, and `calc()` and snapshot the rewritten output.

### Common Patterns

- "Build-time isolation + runtime selector rewrite" — pairs with `react-shadow-host/shadow-host-builder.ts`'s `:root` → `:host` replace.

## Dependencies

### Internal

None.

### External

- `clsx`, `tailwind-merge` — runtime class merging.
- `postcss-value-parser` (peer of `postcss`) — value AST walking in the build plugin.

<!-- MANUAL: -->
