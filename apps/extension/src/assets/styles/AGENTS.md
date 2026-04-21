<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# styles

## Purpose

The CSS layer for Read Frog. `theme.css` is the Tailwind v4 entry point used by every React UI surface (popup, options, side panel, content shadow roots), exposing shadcn-flavoured design tokens through a `--rf-*` prefix to avoid collisions with host-page custom properties. `host-theme.css` ships the `--read-frog-*` tokens that drive injected translation-node styling on third-party websites, while `translation-node-preset.css` and `custom-translation-node.css` provide the actual on-page translation visual variants. `text-small.css` overrides Tailwind's text-size scale for the popup's compact layout.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme.css`                   | Tailwind v4 entry (`@import "tailwindcss"`, `tw-animate-css`, `shadcn/tailwind.css`). Defines `@theme inline` mapping shadcn token names to `--rf-*` CSS variables, light/dark `:root` value sets in OKLCH (primary green `oklch(0.693 0.17 162.48)`), `data-horizontal` / `data-vertical` Base UI variants, and the `border-border` + `bg-background` `@layer base` reset. Imported by every React entrypoint via `import "@/assets/styles/theme.css"` or as `?inline` for shadow-DOM injection (see `mount-host-toast.tsx`, `mount-subtitles-ui.tsx`). |
| `host-theme.css`              | Defines `--read-frog-primary`, `--read-frog-muted`, and `--read-frog-muted-foreground` CSS variables under `:root` with a `prefers-color-scheme: dark` override. Imported by `custom-translation-node.css` and injected into host pages — token names are deliberately `--read-frog-*` (not `--rf-*`) for legacy back-compat with shipped CSS overrides.                                                                                                                                                                                                 |
| `text-small.css`              | Overrides `--text-xs` through `--text-xl` (10/12/14/16/18 px) so the popup and small UI surfaces render at a compact scale. Imported by `popup/main.tsx` and `side.content/index.tsx`.                                                                                                                                                                                                                                                                                                                                                                   |
| `custom-translation-node.css` | `data-read-frog-custom-translation-style="..."` selectors implementing the user-selectable translation visual presets (`blur`, `blockquote`, `weakened`, `dashedLine`, `border`, `textColor`, `background`). Imported as `?raw` by `style-injector.ts` and pushed into the host-page shadow root.                                                                                                                                                                                                                                                        |
| `translation-node-preset.css` | Default translation-node typography rules (display + word-break) plus per-language font stacks for `zh`, `zh-TW`, `ja`, `ar`, `fa`, `ur`, etc. Targets `.read-frog-translated-content-wrapper` / `.read-frog-translated-block-content` / `.read-frog-translated-inline-content`. Imported as `?raw` by `style-injector.ts`.                                                                                                                                                                                                                              |

## Subdirectories

| Directory    | Purpose                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `__tests__/` | Vitest specs for the style-injection helpers and CSS parsing (skipped per instructions). |

## For AI Agents

### Working In This Directory

- Two distinct token namespaces coexist intentionally: **`--rf-*`** for the React UI inside the extension's own surfaces (popup, options, side panel, shadow-mounted UIs); **`--read-frog-*`** for the translation nodes injected into arbitrary host pages. Don't merge them — the host-page namespace is shipped as part of the public CSS contract.
- Translation-node CSS files (`translation-node-preset.css`, `custom-translation-node.css`) must use only properties that are safe inside any host page (no global `body`, no `html` resets, no `*` selectors that escape the wrapper). Stick to scoped class selectors `.read-frog-translated-*` or attribute selectors `[data-read-frog-*]`.
- Use OKLCH in `theme.css` to stay consistent with shadcn defaults — don't introduce new colours in HSL/RGB.
- When you add a new shadcn token, register it both under `@theme inline` AND under both `:root` (light) and `.dark` blocks; otherwise dark mode silently falls back.
- Files imported via `?inline` are bundled as a string and inserted into a shadow root at runtime — keep them self-contained (no relative `@import` chains the bundler can't resolve at build time).
- `?raw` imports skip Vite preprocessing entirely; `custom-translation-node.css` therefore ships its `@import "@/assets/styles/host-theme.css"` literally — a sibling `?raw` import of `host-theme.css` is responsible for resolving it (see `style-injector.ts`).

### Testing Requirements

`__tests__/` runs under Vitest (jsdom). Tests typically `vi.doMock("...?raw", () => ({ default: "..." }))` to feed canned CSS into the injector and assert on extracted selectors.

### Common Patterns

- `@custom-variant dark (&:is(.dark *))` — Tailwind v4 way to hook the `.dark` class.
- `@custom-variant data-horizontal (&[data-orientation="horizontal"])` — short variants for Base UI orientation attributes.
- `data-read-frog-custom-translation-style="<preset>"` attribute hook — JS toggles the value and CSS owns the visuals.

## Dependencies

### Internal

- `@/assets/styles/host-theme.css` — re-imported by `custom-translation-node.css` and injected by `@/utils/host/translate/ui/style-injector.ts`
- Consumed by `src/entrypoints/{popup,options,side.content,selection.content,translation-hub}/main.tsx|index.tsx` and the spinner/host-toast/subtitles renderers under `src/utils/host/translate/ui/` and `src/entrypoints/*.content/`

### External

- `tailwindcss` v4 (with `@import "tailwindcss"` syntax)
- `tw-animate-css` — animation utilities preset
- `shadcn/tailwind.css` (via the `shadcn` package) — base component tokens

<!-- MANUAL: -->
