<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# badges

## Purpose

Small status badges for marking new/featured surfaces. Currently a single `NewBadge` that renders the shared `ui/base-ui/badge` primitive with the `accent` variant and a fixed "New" label, while passing through the `size` variant prop and an optional `className`.

## Key Files

| File            | Description                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `new-badge.tsx` | Renders `<Badge variant="accent">New</Badge>`; reuses `badgeVariants` for the `size` `VariantProps`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- This folder is for _labeled_ badges (semantic meaning baked into the component), not generic ones; for generic styling reach for `ui/base-ui/badge` directly.
- Keep new badges narrow: a fixed label/variant, with `size` and `className` as the only knobs, mirroring `NewBadge`.
- Pull `VariantProps`/`badgeVariants` from `@/components/ui/base-ui/badge` so size tokens stay in sync with the primitive.

### Testing Requirements

- Vitest + `@testing-library/react`. Add tests in a sibling `__tests__/` folder. Assert the rendered text label and the resolved variant class (e.g. `getByText("New")` and `expect(...).toHaveClass(...)` against `badgeVariants({ variant: "accent" })`).

### Common Patterns

- `Pick<VariantProps<typeof badgeVariants>, "size">` to expose only the variant props you need.
- No `forwardRef` here - badges are non-interactive; if you need ref-forwarding, prefer extending `Badge` (which uses `useRender` + `mergeProps`) over re-implementing it.

## Dependencies

### Internal

- `@/components/ui/base-ui/badge` (`Badge`, `badgeVariants`).

### External

- `class-variance-authority` - typed `VariantProps` for the `size` prop.

<!-- MANUAL: -->
