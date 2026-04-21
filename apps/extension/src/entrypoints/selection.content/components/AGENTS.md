<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# components

## Purpose

Reusable React widgets shared by the selection toolbar and its result popovers (translation popover, custom-action popover). Unlike `selection-toolbar/`, nothing here owns selection state or analytics — these are presentational primitives styled for the in-page Shadow Root: copy/speak buttons, the collapsible source-text block shown above translation/custom-action output, the error alert, the popover title/footer scaffolding, and the popover-aware tooltip wrapper that works around real-browser hover-leave bugs in Base UI tooltips when rendered through portals.

## Key Files

| File                                   | Description                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copy-button.tsx`                      | Icon button that writes `text` to `navigator.clipboard`, flips to a green check for 1.5s, and shows the `useSelectionTooltipState`-driven tooltip.                                                                                                                                                                |
| `speak-button.tsx`                     | TTS toggle around `useTextToSpeech(ANALYTICS_SURFACE.SELECTION_TOOLBAR)` — three states (idle/fetching/playing) with matching icon and tooltip text.                                                                                                                                                              |
| `selection-source-content.tsx`         | Collapsible source-text block: 3-line clamp by default, expands to a scroll-area with copy/speak actions; renders the trailing `<Separator>` between source and result.                                                                                                                                           |
| `selection-toolbar-error-alert.tsx`    | Renders a `SelectionToolbarInlineError` (title + description) inside an `Alert variant="destructive"`; renders nothing when `error` is null.                                                                                                                                                                      |
| `selection-toolbar-footer-content.tsx` | Popover footer: provider selector + slotted `children` + "view context details" popover (`ContextDetailsButton`) showing title and paragraphs + regenerate button.                                                                                                                                                |
| `selection-toolbar-title-content.tsx`  | Popover title row with an `@iconify/react` icon and a truncating `SelectionPopover.Title`.                                                                                                                                                                                                                        |
| `selection-tooltip.tsx`                | Tooltip wrappers that scope a workaround (transparent positioner + popup) to selection-content overlays only. Exposes `useSelectionTooltipState`, `SelectionToolbarTooltip` (toolbar buttons, portaled into `shadowWrapper`), and `SelectionPopoverTooltip` (popover buttons, portaled into the popover overlay). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- `useSelectionTooltipState` exists to keep tooltips open until the user moves away even after a button press: it ignores `nextOpen=false` when the close reason is `"trigger-press"`. Reuse it for any new icon button that needs that pattern.
- `SelectionToolbarTooltip` portals into `shadowWrapper` (the global selection shadow root), `SelectionPopoverTooltip` portals into the popover's own overlay (via `useSelectionPopoverOverlayProps`). Pick the right one — toolbar buttons must use the toolbar variant or tooltips will mis-position when the toolbar repositions itself.
- The transparent-tooltip workaround (both `popup` and `positioner` get `pointer-events: none`) is intentional and documented inline; do not strip it without testing hover-leave on real Chrome.
- `selection-toolbar-footer-content.tsx` previews paragraphs/title via `data-slot` and `data-field` attributes — those are queried by tests; preserve them.
- `SelectionSourceContent` always renders the trailing `<Separator>` so callers do not need to add one between source and translation; it accepts `separatorClassName` for spacing tweaks.

### Testing Requirements

- Tests live in `__tests__/action-tooltips.test.tsx`, `__tests__/selection-toolbar-footer-content.test.tsx`, `__tests__/selection-toolbar-title-content.test.tsx`. Run `pnpm test`.
- These are React Testing Library tests; mock `useTextToSpeech` and `navigator.clipboard.writeText` when relevant.
- `SKIP_FREE_API` does not affect this directory.

### Common Patterns

- `Activity` (React 19) for hide/show without unmounting (used in `SelectionSourceContent` to keep the action row mounted across collapse).
- Tooltip-with-state-machine (`useSelectionTooltipState`) instead of uncontrolled tooltips so press → open → hover-out behaves on Base UI v0 + Shadow Root.
- Portaling Base UI overlays into either `shadowWrapper` or the popover overlay container exposed by `useSelectionPopoverOverlayProps()` so positioning math works inside the shadow.
- All copy variants come from `i18n.t(...)` keys under `action.*` / `speak.*` — never inline English strings.

## Dependencies

### Internal

- `@/components/ui/base-ui/*` — `Alert`, `Button` (`buttonVariants`), `Field`, `Popover`, `ScrollArea`, `Separator`, `Tooltip`.
- `@/components/ui/selection-popover` — `SelectionPopover.*`, `useSelectionPopoverOverlayProps()`.
- `@/components/llm-providers/provider-selector` — provider dropdown rendered into the popover footer.
- `@/hooks/use-text-to-speech` — the TTS playback hook.
- `@/utils/styles/utils` (`cn`), `@/types/analytics`, `@/utils/atoms/config` (`configFieldsAtomMap.tts`).
- `..` — imports `shadowWrapper` and `SELECTION_CONTENT_OVERLAY_LAYERS` from the parent `index.tsx` / `overlay-layers.ts`.
- `../selection-toolbar/inline-error` — the `SelectionToolbarInlineError` shape consumed by the error alert.

### External

- `react` 19 — `Activity`, `useState`, `useCallback`, `useEffect`, `useRef`.
- `jotai` — `useAtomValue` for TTS config.
- `@tabler/icons-react`, `@iconify/react`, `@remixicon/react` — icon sets.
- `#imports` — `i18n`.

<!-- MANUAL: -->
