<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-27 | Updated: 2026-04-27 -->

# analytics

## Purpose

PostHog analytics integration for the API worker. Provides a layered stack: a low-level HTTP capture primitive (`posthog.ts`), typed domain-event helpers (`events.ts`), and a structured logger that fans out to PostHog on significant events (`logger.ts`).

Analytics calls are always **fire-and-forget** — errors are swallowed so they never block or break request handlers.

## Key Files

| File          | Description                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `posthog.ts`  | `captureEvent(opts, fetchImpl?)` — raw POST to the PostHog `/capture/` endpoint. Throws `MissingApiKeyError` if `apiKey` is empty. Supports configurable `host` (US vs EU). |
| `events.ts`   | Typed event functions (`trackTextTranslateCompleted`, `trackPdfUploaded`, `trackPdfCompleted`, `trackProUpgradeTriggered`) built on top of `captureEvent`. Defines `EventName` union and `AnalyticsContext` shape. |
| `logger.ts`   | `log(level, message, props, ctx)` — structured `console.*` emit with optional PostHog fan-out via `executionCtx.waitUntil`. Keeps log + analytics in one call. |

## For AI Agents

### Working In This Directory

- **Never let analytics errors surface to callers.** Always wrap `captureEvent` / `trackX` calls in `.catch(() => {})` or inside `executionCtx.waitUntil(...)`.
- `AnalyticsContext.fetchImpl` is injectable for tests — use it to mock the PostHog HTTP call instead of monkey-patching `fetch`.
- `POSTHOG_PROJECT_KEY` and `POSTHOG_HOST` come from `WorkerEnv` (`src/env.ts`). If `POSTHOG_PROJECT_KEY` is unset, the call is a no-op (checked by callers before constructing `AnalyticsContext`).
- The `EventName` union in `events.ts` and `analyticsTrackInputSchema` in `@getu/contract` must stay in sync — both enumerate the same set of trackable events.

### Testing Requirements

- Tests live in `__tests__/`. Inject `fetchImpl` to capture calls without hitting the network.
- Verify that `MissingApiKeyError` is thrown when `apiKey` is empty, and that callers silently swallow it.

## Dependencies

### Internal

- `src/env.ts` — `WorkerEnv` (for `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`).

### External

- No npm packages — uses the runtime `fetch` API directly.

<!-- MANUAL: -->
