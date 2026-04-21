<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# icon

## Purpose

The extension's toolbar/manifest icons in the standard browser-extension sizes. WXT auto-detects this directory and wires the icons into the generated `manifest.json`.

## Key Files

| File      | Description                       |
| --------- | --------------------------------- |
| `16.png`  | Toolbar small icon.               |
| `32.png`  | Standard toolbar icon.            |
| `48.png`  | Extension management page icon.   |
| `96.png`  | High-DPI toolbar icon.            |
| `128.png` | Web Store / Add-ons listing icon. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Replace **all five sizes** when redesigning. Stores reject mismatched icons.
- Keep file names exactly `<size>.png` — WXT relies on the convention.
- Source artwork (SVG / PSD) should NOT live here; keep design sources outside `public/` so they don't bloat the build.

### Testing Requirements

- After replacing, run `pnpm build` and verify the produced `manifest.json` lists each size.
- Reload the extension in Chrome / Firefox and visually confirm the toolbar icon.

## Dependencies

None.

<!-- MANUAL: -->
