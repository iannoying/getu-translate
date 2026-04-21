<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# error

## Purpose

Inline error UI rendered next to a failed translation in the host page. `<TranslationError>` shows a retry button (re-runs the bilingual or translation-only pipeline against the original `ChildNode[]`) and an alert icon that opens a `HoverCard` with the HTTP status code (color-coded by digit class) and the underlying `APICallError.message` from the Vercel AI SDK.

## Key Files

| File               | Description                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`        | `TranslationError` - the composed `RetryButton` + `ErrorButton` row. Adds `notranslate` so Chrome translation doesn't touch it.                                                                                                          |
| `retry-button.tsx` | `RetryButton` - tooltip-wrapped icon button that reads the current `configAtom`, generates a fresh `walkId`, and re-invokes either `translateNodesBilingualMode` or `translateNodeTranslationOnlyMode` based on `config.translate.mode`. |
| `error-button.tsx` | `ErrorButton` + private `StatusCode` helper. Renders `IconAlertCircle` inside a `HoverCard`; the popup is portaled into the shadow host (`container={shadowWrapper}`) and styled as an `Alert`.                                          |

## Subdirectories

None (the `__tests__/` folder is intentionally not documented).

## For AI Agents

### Working In This Directory

- Always portal the hover card / tooltip into the shadow host returned by `use(ShadowWrapperContext)`; otherwise the popup mounts in the page DOM and inherits the host site's CSS.
- The retry path is mode-aware: respect `config.translate.mode` (`bilingual` vs `translationOnly`); adding new modes requires a branch here AND in `@/utils/host/translate/node-manipulation`.
- `walkId` from `getRandomUUID()` keeps each retry idempotent against the host script's de-dup logic - don't reuse ids.
- Status code coloring uses the leading digit (2xx green, 3xx blue, 4xx yellow, 5xx red); preserve that contract if you add new error sources.

### Testing Requirements

- Vitest + `@testing-library/react`. Co-located in `__tests__/`. Stub `ShadowWrapperContext`, mock `@/utils/host/translate/node-manipulation`, and assert that clicking retry calls the right pipeline with the original `nodes`. For the hover card, test status-code coloring with values like 200, 404, 503.

### Common Patterns

- Compose icon buttons with shadcn-style `size-4` icons inside `<Tooltip>` / `<HoverCard>` triggers using the `render={...}` prop from `@base-ui/react`.
- `use(ShadowWrapperContext)` (React 19) instead of `useContext`.
- Color tokens via Tailwind utility (`text-destructive`, `text-blue-500`) so theme switching applies automatically.

## Dependencies

### Internal

- `@/components/ui/base-ui/alert`, `hover-card`, `tooltip`.
- `@/utils/atoms/config#configAtom`.
- `@/utils/crypto-polyfill#getRandomUUID`.
- `@/utils/host/translate/node-manipulation` - retry pipelines.
- `@/utils/react-shadow-host/create-shadow-host#ShadowWrapperContext`.

### External

- `ai` - `APICallError` shape (statusCode, message).
- `@tabler/icons-react` - `IconAlertCircle`, `IconReload`.
- `jotai` - `useAtomValue`.

<!-- MANUAL: -->
