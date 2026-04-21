<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# selection-popover

## Purpose

Custom popover anchored to a text selection inside content scripts (used by `entrypoints/selection.content/*`). Built as a compound component (`SelectionPopover.Root`/`Trigger`/`Content`/`Header`/`Body`/`Footer`/`Title`/`Description`/`Pin`/`Close`) on top of `@base-ui/react/dialog` for state + focus management, wrapped in a `react-rnd` shell so users can drag the popover around and resize it from any edge/corner. The custom layout hook `useSelectionPopoverLayout` keeps the popover inside the viewport while remembering whether the user previously pinned it to the top or to the bottom edge, and `usePreventScrollThrough` stops wheel events from leaking into the host page when the popover hits its scroll bounds.

## Key Files

| File                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                       | Compound API. `Root` provides the `SelectionPopoverRootContext` (open/anchor/pinned/triggerElement), broadcasts a `read-frog:selection-popover-open` window event so siblings auto-close, and disables base-ui's pointer-dismissal when pinned. `Content` portals into a caller-supplied container, sets up the rnd shell with `SELECTION_CONTENT_OVERLAY_LAYERS`/`SELECTION_CONTENT_OVERLAY_ROOT_ATTRIBUTE`, restores focus to the original trigger via `finalFocus`. Exports both the namespaced `SelectionPopover` object and individual named components. Also exports `useSelectionPopoverOverlayProps` so child popups inherit the right portal container + z-layer. |
| `use-selection-popover-layout.ts` | `useSelectionPopoverLayout({ anchor, isVisible })`. Returns rnd `position`/`defaultLayout`/`minWidth`/`minHeight`, drag/resize handlers, and a `handleWheel`. Internally tracks preferred X / vertical (`top` vs `bottom` anchored) memory + manual size, observes the popover with a `ResizeObserver`, and uses `flushSync` to clamp to viewport without a visible overflow frame. Also exports `SELECTION_POPOVER_DRAG_HANDLE_CLASS`, `SELECTION_POPOVER_NO_DRAG_SELECTOR`, `SELECTION_POPOVER_RESIZE_HANDLES`, `SELECTION_POPOVER_RESIZE_HANDLE_STYLES`.                                                                                                                |
| `use-prevent-scroll-through.ts`   | Listens for `wheel` events on a `RefObject<HTMLElement>`; when the body is scrolled to its top/bottom edge, calls `preventDefault`/`stopPropagation` so the underlying page (or another shadow root) doesn't scroll. Uses React 19's `useEffectEvent` to keep the handler stable.                                                                                                                                                                                                                                                                                                                                                                                          |

## Subdirectories

None (the `__tests__/` folder is intentionally not documented).

## For AI Agents

### Working In This Directory

- The popover is a _compound_ component. Always render through the `SelectionPopover` namespace - never call `SelectionPopoverContent` without a `Root` ancestor (it throws because `useSelectionPopoverRootContext` asserts non-null).
- `Content` requires a `container` prop pointing at a stable shadow-host element / `RefObject`; without it, popups inside the body (Tooltip, HoverCard, Select) will mount in the wrong DOM. Use `useSelectionPopoverOverlayProps()` from inside the body to grab the right `container` + `positionerClassName` for nested popups.
- The drag handle is the `<SelectionPopover.Header>` (it adds `SELECTION_POPOVER_DRAG_HANDLE_CLASS`). Buttons/inputs inside the header are excluded by `SELECTION_POPOVER_NO_DRAG_SELECTOR`; if you add a custom interactive element that should not start a drag, mark it with `data-rf-no-drag` (matching the selector).
- `Pin` toggles `pinned`, which flips `disablePointerDismissal` on the underlying base-ui dialog. Don't expose another mechanism to disable dismissal - go through `setPinned` so the broadcast-close behavior stays consistent across instances.
- The `read-frog:selection-popover-open` window event is how multiple selection popovers in the same tab cooperate; preserve `instanceId` filtering when extending the open lifecycle.
- `useSelectionPopoverLayout` deliberately uses `flushSync` in one path (when `ResizeObserver` detects bottom overflow); do NOT remove the `eslint-disable react-dom/no-flush-sync` - asynchronous updates here cause a visible 1-frame overflow.
- `usePreventScrollThrough` only attaches when `isEnabled` is true and the ref resolves; never call it without a ref to a scrollable element or you'll get a no-op + warning at runtime.

### Testing Requirements

- Vitest + `@testing-library/react`. Co-located in `__tests__/`. For `useSelectionPopoverLayout`, drive `window.innerWidth/innerHeight` and emit ResizeObserver callbacks via a shimmed observer; assert position memory across viewport changes. For the components, render under a stub `ShadowWrapperContext` and assert that focus restoration uses the `finalFocus={triggerElement}` path.

### Common Patterns

- Compound components built with `useRender({ defaultTagName, props: mergeProps(...), render, state: { slot, ... } })` so consumers can pass `render={<MyComponent />}` and override the host element.
- All popup-ish state (open, anchor, pinned, triggerElement) lives in a single context value and is memoized with `useMemo` to keep the dialog from re-rendering on unrelated changes.
- Layout memory tracked through refs (`preferredLayoutRef`, `isDraggingRef`, `suppressResizeObserverRef`) instead of state to avoid render storms on drag/resize.
- "Bottom-anchored" detection uses a 1px tolerance (`BOTTOM_EDGE_TOLERANCE`) so subpixel browser rounding doesn't flip the layout mode.

## Dependencies

### Internal

- `@/components/ui/base-ui/button` - `Pin` / `Close` styling.
- `@/entrypoints/selection.content/overlay-layers` - `SELECTION_CONTENT_OVERLAY_LAYERS`, `SELECTION_CONTENT_OVERLAY_ROOT_ATTRIBUTE` (z-index ladder shared with other selection overlays).
- `@/utils/constants/dom-labels#NOTRANSLATE_CLASS` - applied to the popover so Chrome translation doesn't touch UI chrome.
- `@/utils/styles/utils#cn`.

### External

- `@base-ui/react/dialog` - underlying open/close + focus + pointer-dismissal.
- `@base-ui/react/merge-props` + `use-render` - compound polymorphism.
- `react-rnd` - drag + resize shell.
- `@tabler/icons-react` - `IconGripHorizontal`, `IconPin`, `IconPinnedFilled`, `IconX`.
- `react@19` - `use`, `useEffectEvent`, `useReducer`.
- `react-dom@19` - `flushSync` for the bottom-overflow correction frame.

<!-- MANUAL: -->
