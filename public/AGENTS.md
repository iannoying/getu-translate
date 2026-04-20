<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# public

## Purpose

Static assets that WXT copies verbatim into the built extension's root. Anything here is reachable at the extension's URL root (e.g. `chrome-extension://<id>/icon/128.png`).

## Key Files

This directory contains no top-level files — see `icon/`.

## Subdirectories

| Directory | Purpose                                                                           |
| --------- | --------------------------------------------------------------------------------- |
| `icon/`   | The extension's toolbar/store icons in 16/32/48/96/128 px (see `icon/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Anything added here is **shipped to every user** — keep this directory small.
- Filenames here become URL paths inside the extension; rename only when you know every reference (manifest, code) is updated.
- Do NOT put images that are only used in marketing/store/README here — those go to repo-level `/assets/`, which is excluded from the zip.

### Testing Requirements

- After adding/replacing a file, run `pnpm dev` and confirm the asset is served from the extension root.

### Common Patterns

- WXT auto-discovers `public/` (no config needed).

## Dependencies

None.

<!-- MANUAL: -->
