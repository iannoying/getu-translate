<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# debug

## Purpose

Browser-side debug snippets meant to be pasted into a host page's DevTools console (or an extension page's DevTools) for ad-hoc investigation. NOT bundled into the extension and not invoked by any build script.

## Key Files

| File                   | Description                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `four-finger-touch.js` | Simulates a four-finger touch gesture in the page, used while debugging multi-touch / mobile-emulation interactions. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Snippets must be **self-contained** — no imports, no bundler. Copy-paste into a console must just work.
- Prefer ES2020+ syntax (modern Chrome/Firefox runtime).
- Do not add snippets that mutate user storage or DOM in a destructive way without obvious commented warnings.

### Testing Requirements

- None automated — manual smoke in DevTools.

### Common Patterns

- IIFE wrappers to avoid leaking globals.
- `console.log` is acceptable here (this is debug code, not production code).

## Dependencies

### Internal / External

None.

<!-- MANUAL: -->
