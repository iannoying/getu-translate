<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# icons

## Purpose

Brand and identity raster/vector assets bundled into the extension. The single top-level file is the master Read Frog brand mark used by the floating button, popup header, and options surface; the `avatars/` leaf carries default user avatars (currently only the unauthenticated guest icon).

## Key Files

| File            | Description                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `read-frog.png` | Master Read Frog brand logo (PNG, ~48 KB). Imported as a Vite asset URL by the floating button, popup header, and options sidebar. |

## Subdirectories

| Directory  | Purpose                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `avatars/` | Default avatar artwork — currently a single `guest.svg` for unauthenticated/Google-Drive-not-connected states. (Pure-asset leaf; no AGENTS.md.) |

## For AI Agents

### Working In This Directory

- The brand PNG is intentionally raster — keep updates dimensionally consistent (multiple use sites assume ~square aspect) and re-export at the same pixel density to avoid layout shifts.
- Manifest icons live elsewhere (`/public/` or `wxt.config.ts`'s manifest block); editing `read-frog.png` here does **not** change the toolbar/installer icon.
- Prefer SVG for any new avatar/identity art so it can re-color via `currentColor` inside shadow roots.
- Import these via the `@/assets/icons/...` alias so Vite fingerprints them on build.

### Testing Requirements

No automated tests.

### Common Patterns

- `import logoUrl from "@/assets/icons/read-frog.png"` then `<img src={logoUrl} />`.

## Dependencies

### Internal

Imported by floating button, popup, and options entrypoints under `src/entrypoints/**`.

### External

None (handled by Vite asset pipeline).

<!-- MANUAL: -->
