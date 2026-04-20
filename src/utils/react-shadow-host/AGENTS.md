<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# react-shadow-host

## Purpose

The mechanism every content-script UI uses to mount React inside an open Shadow Root with full Tailwind/theme isolation from the host page. Wraps the inner React tree with `ThemeProvider` + `TooltipProvider` + a `ShadowWrapperContext` exposing the inner container, splits CSS into "stays in shadow" vs. "must live in document" (for `@property` and `@font-face` rules the engine refuses inside Shadow DOM), de-duplicates document-level CSS via a hash-keyed reference-counted registry, and tracks per-host cleanup so unmounting actually disposes the React root and frees the registry slot.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-shadow-host.tsx` | `createReactShadowHost(component, { position, inheritStyles, className?, cssContent?, style? })` — creates the host `div`, opens a shadow root, builds it via `ShadowHostBuilder`, mounts the React tree wrapped in `ShadowWrapperContext`/`ThemeProvider`/`TooltipProvider`, and stores cleanup on `__reactShadowContainerCleanup`. `removeReactShadowHost(host)` runs that cleanup once and removes the node. Also exports the `ShadowWrapperContext` consumed by components that need a portal target. |
| `shadow-host-builder.ts` | `ShadowHostBuilder` — receives the shadow root + options, prepends a WXT-style `:host { all: initial; … }` reset (unless `inheritStyles`), rewrites every `:root` selector in user CSS to `:host`, splits out `@property`/`@font-face` rules into document CSS via `cssRegistry.inject`, and appends a wrapper `<div>` whose `display` matches `position`. `cleanup()` returns the registry key.                                                                                                          |
| `css-registry.ts`        | Singleton `CSSRegistry` — `inject(css)` hashes (`Sha256Hex`) the document CSS, reuses the existing `<style data-read-frog-react-shadow-css-key>` if present (incrementing a ref count), or appends a new one. `remove(key)` decrements and removes the style at zero — so multiple shadow hosts sharing identical document CSS only emit one `<style>`.                                                                                                                                                   |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Always pair `createReactShadowHost` with `removeReactShadowHost`.** Skipping the latter leaks the React root, leaves an orphan `<style>` in `document.head`, and prevents the `cssRegistry` ref count from hitting zero. The double-cleanup guard (`__reactShadowContainerCleaned`) makes calling it twice safe.
- **Pass `cssContent` as full stylesheets, not selector strings.** The builder rewrites `:root` → `:host` so Tailwind preflight + theme variables you'd normally apply to `:root` will end up scoped to the shadow host. Anything that absolutely must live in the document (`@property`, `@font-face`) is split out automatically — do not try to pre-strip those rules yourself.
- **`inheritStyles: true` skips the reset.** Use it sparingly — the default `all: initial` reset is the only thing keeping host-page selectors out of your component. The reset preserves `color-scheme: inherit` and a sane `font-family`; box-sizing is forced to `border-box` for everything inside.
- **`position: 'inline' | 'block'`** controls both `shadowHost.style.display` and the inner wrapper's display — needed because some hosts must be inline (e.g. selection toolbar inserted inside a paragraph).
- The internal regex `PROPERTY_AND_FONT_FACE_RULES_PATTERN` is intentionally simple — it does not handle nested at-rules. If you ever need to ship deeply-nested at-rules, replace it with a proper PostCSS pass rather than tweaking the regex (backtracking risk).
- The CSS registry key is a stable SHA256 — swapping in a new style tag with identical content is a no-op (ref count +1). Use this property to share heavy stylesheets between several hosts on the same page.

### Testing Requirements

- No co-located tests today. When adding tests, mount in `happy-dom`, assert the shadow root contents, and verify the `cssRegistry` ref-count goes to 0 after `removeReactShadowHost`.

### Common Patterns

- **Render as a portal target.** Components inside the shadow tree consume `ShadowWrapperContext` to get the inner container, then portal popovers/tooltips into it instead of `document.body` (which would fall outside the shadow boundary and lose Tailwind classes).
- **One factory per content script entrypoint.** Build a thin wrapper that knows your CSS bundles and just forwards `component` + `position`, so individual call sites do not have to repeat options.

## Dependencies

### Internal

- `@/components/providers/theme-provider` — themes the inner tree against `container`.
- `@/components/ui/base-ui/tooltip` — `TooltipProvider` for Radix-style tooltips inside shadow.
- `@/utils/constants/dom-labels` — `REACT_SHADOW_HOST_CLASS` tag added to every host.
- `@/utils/hash` — `Sha256Hex` for CSS dedup.

### External

- `react`, `react-dom/client` — `createRoot` to mount the wrapped tree.

<!-- MANUAL: -->
