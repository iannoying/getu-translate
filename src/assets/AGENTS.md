<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# assets

## Purpose

In-source assets bundled with the extension. These are imported by application code through the `@/assets/...` alias (or `?inline` / `?raw` Vite suffixes) and are **distinct from `/assets/` at the repo root** which holds web-store/landing-page artwork. Subdirectories cover styles (Tailwind v4 entry + injectable host-page CSS), brand icons, provider logos, and demo screenshots used by docs/onboarding.

## Key Files

This directory has no top-level files — only subdirectories.

## Subdirectories

| Directory    | Purpose                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `styles/`    | Tailwind v4 entry (`theme.css`), shadow-host theme variables (`host-theme.css`), text-size overrides (`text-small.css`), translation-node preset/custom CSS (see `styles/AGENTS.md`).                  |
| `icons/`     | Read Frog logo PNG plus `avatars/` subfolder; see `icons/AGENTS.md`.                                                                                                                                   |
| `providers/` | (Skipped — pure SVG logos for translation/LLM provider branding: `custom-provider`, `deeplx-{light,dark}`, `tensdaq-{color,light,dark}`. Imported as Vite asset URLs from provider-picker components.) |
| `demo/`      | (Skipped — pure PNG screenshots: `context-menu.png`, `floating-button.png`, `selection-toolbar.png`. Used by onboarding/docs.)                                                                         |

## For AI Agents

### Working In This Directory

- Distinguish `src/assets/` (bundled with the extension code) from `<repo-root>/assets/` (used by the web-store listing and landing page). Do not move files between them without updating both build pipelines.
- Stylesheets injected into a website's DOM via shadow roots must use the `?inline` (string) or `?raw` (string with no Vite processing) Vite suffix — see content-script entries in `src/entrypoints/*.content/**` for the pattern.
- Provider SVGs come in light/dark/color variants; pick the correct one based on theme rather than baking colors via CSS filters.
- New icons should ship as SVG when possible (CSS-themable, scalable); only fall back to PNG/WebP for raster art like the brand frog.

### Testing Requirements

`styles/__tests__/` contains Vitest snapshot/parsing tests for the host-page CSS injection helpers. Other asset folders are untested.

### Common Patterns

- Vite import suffixes: `import css from "@/assets/styles/theme.css?inline"` for shadow-DOM injection, `?raw` when the consumer prepends an `@import` itself.
- Per-feature theme tokens live in `styles/host-theme.css` under the `--read-frog-*` namespace so they can't collide with host-page custom properties.

## Dependencies

### Internal

Imported across `src/entrypoints/**` (popup, options, side, host, subtitles, selection, translation-hub) and `src/utils/host/translate/ui/**` for shadow-DOM style injection.

### External

- Vite (via WXT) handles `?inline` / `?raw` / URL imports.
- Tailwind v4 + `tw-animate-css` + the `shadcn/tailwind.css` preset are pulled in by `styles/theme.css`.

<!-- MANUAL: -->
