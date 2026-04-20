<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# dom

## Purpose

Generic DOM helpers used by content scripts. Currently the single concern is "wait for an element to appear in the page" — used by entrypoints that have to defer wiring up UI until a host-page element (e.g. YouTube's player container) has finished mounting.

## Key Files

| File                  | Description                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wait-for-element.ts` | `waitForElement(selector, validate?)` — `querySelector` first, then a `MutationObserver` on `document.body` (`childList: true, subtree: true`). Resolves with the element or `null` after a hard 10 s timeout; auto-disconnects the observer in both cases. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- The 10 s `WAIT_TIMEOUT` is a module constant — bump it locally if a host page is genuinely slow, but **never poll forever**: the observer keeps running until cleanup and accumulates work in long-lived tabs.
- The optional `validate` callback is the right place to filter "wrong instance of selector" (e.g. multiple `.video-player` while only one is interactive). Returning `false` keeps observing.
- `subtree: true` on `document.body` is broad — fine for one-shot lookups but do NOT hold a reference to a long-lived `MutationObserver` from this helper. The promise resolves once and disconnects.
- This helper resolves to `Element | null` (not `HTMLElement`). Cast at the call site if you need `HTMLElement` APIs.

### Testing Requirements

- No co-located tests today. To test, render a fake DOM with `happy-dom` (Vitest default in this repo) and append the target element after a tick.

### Common Patterns

- One-shot observer with timeout — replicate this shape (rather than polling with `setInterval`) for any other "appears later" detection.

## Dependencies

### Internal

None — leaf module.

### External

None — uses only standard DOM (`document`, `MutationObserver`, `setTimeout`).

<!-- MANUAL: -->
