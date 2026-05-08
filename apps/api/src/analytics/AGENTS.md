<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-27 | Updated: 2026-05-08 -->

# analytics

## Purpose

PostHog analytics + structured logging integration for the API worker. Provides a layered stack:

1. `posthog.ts` — low-level HTTP capture primitive.
2. `events.ts` — typed domain-event helpers.
3. `logger.ts` — structured `info` / `warn` / `error` logger with sampled, gated PostHog fan-out (M7-C3 replaces ad-hoc `console.warn` / `console.error` across the worker; M7-B2 added per-call sampling + forwarding gate).
4. `__tests__/console-audit.test.ts` — guard test that fails the build if new bare `console.warn` / `console.error` calls leak in outside this module.

Analytics calls are always **fire-and-forget** — errors are swallowed so they never block or break request handlers.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `posthog.ts` | `captureEvent(opts, fetchImpl?)` — raw POST to `${host}/capture/`. Default host `https://us.i.posthog.com` (override for EU residency). Throws `MissingApiKeyError` if `apiKey` is empty/whitespace; throws `Error` on non-2xx. Caller is expected to wrap in `ctx.waitUntil(captureEvent(...).catch(() => {}))`.                                                                          |
| `events.ts`  | Typed event functions (`trackTextTranslateCompleted`, `trackPdfUploaded`, `trackPdfCompleted`, `trackProUpgradeTriggered`, …) built on top of `captureEvent`. Defines the `EventName` union and `AnalyticsContext` shape with injectable `fetchImpl`.                                                                                                                                    |
| `logger.ts`  | `logger.{info,warn,error}(message, props, ctx)`. PostHog fan-out is gated by `shouldForward(level, ctx)` — defaults: error=true, warn=false, info=false. `ctx.forward` overrides the default; `ctx.sampleRate` (0..1) drops events probabilistically. Forward only fires when `env.POSTHOG_PROJECT_KEY` and `executionCtx` are both present, via `waitUntil`. `distinctId` falls back to `props.userId` or `"system"`. Event name is always `internal_log`. |

## For AI Agents

### Working In This Directory

- **Never let analytics errors surface to callers.** Always wrap `captureEvent` / `trackX` calls in `.catch(() => {})` or inside `executionCtx.waitUntil(...)`.
- **Use `logger.{info,warn,error}` everywhere in the worker** — bare `console.warn` / `console.error` is enforced against by `console-audit.test.ts`. The test allows `console.*` only inside this module and a small allowlist; new violations fail CI.
- `AnalyticsContext.fetchImpl` is injectable for tests — use it to mock the PostHog HTTP call instead of monkey-patching `fetch`.
- `POSTHOG_PROJECT_KEY` and `POSTHOG_HOST` come from `WorkerEnv` (`src/env.ts`). If `POSTHOG_PROJECT_KEY` is unset, fan-out is a no-op and the console line still emits.
- The `EventName` union in `events.ts` and `analyticsTrackInputSchema` in `@getu/contract` must stay in sync — both enumerate the same set of trackable events.
- **Sampling defaults**: pass `{ sampleRate: 0.1 }` for high-volume warn/info events that you opt into forwarding. `sampleRate` outside `[0, 1]` is treated as `0`. Don't sample errors — they're rare and load-bearing for alerting.

### Testing Requirements

- Tests live in `__tests__/`. Inject `fetchImpl` to capture calls without hitting the network.
- Verify that `MissingApiKeyError` is thrown when `apiKey` is empty, and that callers silently swallow it.
- When asserting `logger` behavior, stub `Math.random` (or set `sampleRate: 1`) so the forward path is deterministic.
- `console-audit.test.ts` walks `src/**/*.ts` — keep new console-bypass allowances tightly scoped and documented inline.

## Dependencies

### Internal

- `src/env.ts` — `WorkerEnv` (for `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`).

### External

- No npm packages — uses the runtime `fetch` API directly.

<!-- MANUAL: -->
