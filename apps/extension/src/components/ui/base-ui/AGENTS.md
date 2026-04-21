<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# base-ui

## Purpose

Project's shadcn/ui-equivalent primitive layer, but rebuilt on top of `@base-ui/react` (Material's unstyled primitive set). Each file mirrors a shadcn component name (`Button`, `Dialog`, `Select`, `Sheet`, `Sidebar`, `Tooltip`, ...) and provides the styled wrapper around the corresponding `@base-ui/react` primitive plus a `cva` variant catalog where applicable. Components are designed to be portal-aware (every popup-style primitive accepts a `container` prop) so they can be rendered inside content-script shadow hosts. A shared animation contract lives in `popup-animation-classes.ts`.

## Key Files

| File                                                                                               | Description                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button.tsx`                                                                                       | `Button` + `buttonVariants` (`cva`). Variants: `default`/`outline`/`secondary`/`ghost`/`ghost-secondary`/`destructive`/`link`. Sizes: `default`/`xs`/`sm`/`lg`/`icon`/`icon-xs`/`icon-sm`/`icon-lg`. Backed by `@base-ui/react/button`. |
| `badge.tsx`                                                                                        | `Badge` + `badgeVariants` (`cva`). Adds `accent` variant on top of standard set; uses `useRender` + `mergeProps` so callers can swap the rendered element via `render={...}`.                                                           |
| `alert.tsx`                                                                                        | Alert / AlertTitle / AlertDescription, no underlying base-ui primitive (pure styled `div`).                                                                                                                                             |
| `alert-dialog.tsx`                                                                                 | Confirm-style dialog built on `@base-ui/react/alert-dialog`.                                                                                                                                                                            |
| `dialog.tsx`                                                                                       | Modal dialog with backdrop + close button. Uses `SHARED_POPUP_CLOSED_STATE_CLASS` for animation.                                                                                                                                        |
| `sheet.tsx`                                                                                        | Side-sheet variant of dialog (used by `prompt-configurator/configure-prompt.tsx`).                                                                                                                                                      |
| `popover.tsx` / `hover-card.tsx` / `tooltip.tsx`                                                   | Popover-family primitives, all accepting `container` for shadow-DOM portals.                                                                                                                                                            |
| `dropdown-menu.tsx` / `menu.tsx`-style files                                                       | Menu primitives.                                                                                                                                                                                                                        |
| `select.tsx`                                                                                       | Generic `Select<T>` with portal positioner, optional `alignItemWithTrigger` (combobox-style alignment), and `min-w-(--anchor-width)` sizing tied to base-ui's CSS variables.                                                            |
| `combobox.tsx`                                                                                     | Searchable list select built on `@base-ui/react/combobox`.                                                                                                                                                                              |
| `command.tsx`                                                                                      | Command-palette primitive.                                                                                                                                                                                                              |
| `field.tsx`                                                                                        | `Field` / `FieldLabel` / `FieldError` used by `components/form/*`.                                                                                                                                                                      |
| `input.tsx` / `textarea.tsx` / `input-group.tsx`                                                   | Form text inputs + grouped variants.                                                                                                                                                                                                    |
| `checkbox.tsx` / `radio-group.tsx` / `switch.tsx` / `slider.tsx`                                   | Toggle / range primitives.                                                                                                                                                                                                              |
| `card.tsx`                                                                                         | `Card` / `CardHeader` / `CardTitle` / `CardContent` / `CardFooter` / `CardAction`.                                                                                                                                                      |
| `tabs.tsx` / `collapsible.tsx` / `progress.tsx` / `separator.tsx` / `skeleton.tsx` / `spinner.tsx` | Layout / state primitives.                                                                                                                                                                                                              |
| `table.tsx` / `scroll-area.tsx`                                                                    | Data display primitives.                                                                                                                                                                                                                |
| `sidebar.tsx`                                                                                      | Full sidebar implementation with `SidebarContext`, cookie-persisted open state (`SIDEBAR_COOKIE_NAME`), keyboard shortcut `b`, and mobile sheet fallback via `useIsMobile`.                                                             |
| `chart.tsx`                                                                                        | Recharts wrapper exposing `ChartConfig` (per-key `label` / `icon` / theme color map) + `useChart` context for legends/tooltips.                                                                                                         |
| `kbd.tsx`                                                                                          | Inline keyboard-key glyph.                                                                                                                                                                                                              |
| `item.tsx` / `empty.tsx` / `button-group.tsx` / `label.tsx`                                        | Smaller helpers used by composites.                                                                                                                                                                                                     |
| `popup-animation-classes.ts`                                                                       | Exports `SHARED_POPUP_CLOSED_STATE_CLASS` (`data-closed:pointer-events-none data-closed:[animation-fill-mode:forwards]`); applied to every popup primitive's content so close animations don't snap or block clicks mid-transition.     |

## Subdirectories

None (the `__tests__/` folder is intentionally not documented).

## For AI Agents

### Working In This Directory

- These files are _generated_-style scaffolding (shadcn-equivalent). When extending, follow the existing shape: `cva` for variants + `data-slot="<name>"` for selectability + `cn(...)` for class merge.
- Every popup primitive (`Popover`, `Select`, `HoverCard`, `Tooltip`, `Dialog`, `Sheet`, `DropdownMenu`, `AlertDialog`) MUST accept and forward a `container` prop to its `Portal`. This lets shadow-DOM hosts (content scripts, selection popover) own the portal target.
- Apply `SHARED_POPUP_CLOSED_STATE_CLASS` from `popup-animation-classes.ts` to every popup `Popup`/`Backdrop`/`Content`. Skipping it makes click handlers misfire during exit animations.
- Use `useRender` + `mergeProps` from `@base-ui/react` for primitives that should support a `render={<MyComponent />}` prop pattern (see `Badge`, `SelectionPopoverPin`).
- Do not pull in `@radix-ui/react-*` for new primitives - the project standardized on `@base-ui/react`. The only Radix usage left is `@radix-ui/react-slot` inside `tree.tsx` for `asChild` polymorphism.
- Keep variant tokens consistent: standard sizes follow the `xs|sm|default|lg` ladder with paired `icon-*` siblings (see `button.tsx`).
- The `sidebar.tsx` cookie name (`SIDEBAR_COOKIE_NAME`) and keyboard shortcut (`b`) are hard-coded; if you fork the sidebar for another surface, swap them or you'll cross-contaminate state.

### Testing Requirements

- Vitest + `@testing-library/react`. Tests live in co-located `__tests__/`. Use accessible queries (`getByRole`) so role-mapping regressions surface. For portal-based primitives, render under a wrapper that exposes a `container` and assert the popup mounts inside it.

### Common Patterns

- `data-slot="<name>"` attribute on every wrapper - drives Tailwind's `[data-slot=...]` selectors elsewhere and lets DOM tests target the right element without leaking implementation classes.
- Tailwind v4 utilities like `data-open:animate-in`, `data-[side=bottom]:slide-in-from-top-2`, and `aria-invalid:ring-destructive/20` lean on base-ui's data attributes; mirror them in new primitives.
- Generic `Select<T>` uses an `itemToStringValue` adapter so consumers can store rich objects without converting to strings up-front.
- `useRender` returns a renderable element directly (no JSX); always `return useRender({...})` from primitives that adopt this pattern.

## Dependencies

### Internal

- `@/utils/styles/utils#cn` - class merging.
- `@/hooks/use-mobile#useIsMobile` - sidebar mobile detection.

### External

- `@base-ui/react` - all unstyled primitives (`button`, `dialog`, `select`, `combobox`, `popover`, `hover-card`, `tooltip`, `tabs`, `collapsible`, `slider`, `switch`, `checkbox`, `radio-group`, `progress`, `scroll-area`, `field`, `menu`, `alert-dialog`).
- `class-variance-authority` - variant builders.
- `@tabler/icons-react` - icons used inside primitives (chevrons, X, sidebar handles).
- `recharts` - chart engine wrapped by `chart.tsx`.
- `@radix-ui/react-slot` - `asChild` polymorphism (only in `chart.tsx`/`tree.tsx`).

<!-- MANUAL: -->
