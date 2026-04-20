<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# icons

## Purpose

Hand-authored SVG icon components for things that the third-party icon sets (`@tabler/icons-react`, `@iconify/react`, `@remixicon/react`) don't cover well. Today this means a 9-dot grid "thinking" spinner with offset SMIL `<animate>` timings used inside the AI thinking panel.

## Key Files

| File                | Description                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `thinking-icon.tsx` | `ThinkingIcon` component: a 105x105 viewBox SVG with nine `<circle>` nodes whose `fill-opacity` animates between 1 and .2 on staggered offsets when `animated` is true; defaults `className` to `size-2.5`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Set `fill="currentColor"` (and `stroke="currentColor"` if applicable) so callers can recolor via `text-*` Tailwind utilities. `thinking-icon.tsx` already does this; thinking text passes `text-primary`/`text-muted-foreground`.
- Default `className` should specify a size (`size-2.5` here). Use `cn(...)` to merge so caller `className` wins.
- Keep animations declarative (SMIL `<animate>`) instead of CSS keyframes - the icon renders correctly inside content-script shadow hosts where global stylesheets don't reach.
- Always extend `React.ComponentProps<"svg">` so consumers can pass standard SVG attributes (`role`, `aria-hidden`, `onClick`).

### Testing Requirements

- Vitest + `@testing-library/react` if behavior matters (e.g. `animated={false}` should remove `<animate>` children). Otherwise visual regression isn't worth it.

### Common Patterns

- Coordinate tables defined as `as const` arrays at module top so React only loops, never recomputes.
- Boolean toggles (`animated`) gate child elements rather than swapping component variants.

## Dependencies

### Internal

- `@/utils/styles/utils#cn` for className merging.

### External

- None - pure React + inline SVG.

<!-- MANUAL: -->
