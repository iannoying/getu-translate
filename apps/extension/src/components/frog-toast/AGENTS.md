<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# frog-toast

## Purpose

Project-branded `sonner` Toaster. Replaces all of sonner's default status icons (`warning`/`success`/`error`/`info`/`loading`) with the Read Frog PNG (resolved through `browser.runtime.getURL` so it works inside content-script shadow hosts), forces `position="bottom-left"` and `richColors` defaults, tags every toast with a kebab-cased `<APP_NAME>-toaster` class, and pins the layer at z-index `2147483647` with a `notranslate` class so page-translate browser features never mangle it.

## Key Files

| File        | Description                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `index.tsx` | Default-exports `FrogToast`, a thin `<Toaster>` wrapper that injects the frog icon, toast class name, and z-index. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Mount `<FrogToast />` once per surface (options page, popup, content script). Anywhere you currently mount sonner's `Toaster` should switch to this wrapper.
- Use `import { toast } from "sonner"` to fire toasts - the wrapper only configures the host. See `prompt-configurator/import-prompts.tsx` for `toast.success`/`toast.error` usage.
- Keep the `notranslate` class and the max-int z-index intact: removing them breaks toasts when Chrome's auto-translate runs or when other extension overlays compete for the top layer.
- The frog icon is loaded with `?url&no-inline` so Vite emits a real asset; do not switch to `?inline`, otherwise content scripts can't resolve it through `browser.runtime.getURL`.

### Testing Requirements

- Vitest + `@testing-library/react`. Mock `#imports` (`browser.runtime.getURL`) and the asset import. Assert that the rendered Toaster receives the icon URL and that `toastOptions.className` includes `<kebab-app-name>-toaster`.

### Common Patterns

- Pass-through of `position`, `toastOptions`, and rest props using `React.ComponentProps<typeof Toaster>` so callers can still override (e.g. switch to `top-right` in the side panel).
- Class-name composition done with array `.filter(Boolean).join(" ")` instead of `cn` because `Toaster` expects a plain string and there's no Tailwind merging concern.

## Dependencies

### Internal

- `@/assets/icons/read-frog.png` - branded icon.
- `@/utils/constants/app#APP_NAME` - kebab-cased into the toast container class.

### External

- `sonner` - underlying toast engine.
- `case-anything#kebabCase` - normalizes the app name for the className.
- `#imports` (WXT) - `browser.runtime.getURL` for shadow-DOM-safe asset URLs.

<!-- MANUAL: -->
