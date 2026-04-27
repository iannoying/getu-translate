<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-27 -->

# orpc

## Purpose

Server-side oRPC router implementing the `@getu/contract` contract. Mounted at `/orpc/*` in `src/index.ts`. Exposes three namespaced sub-routers: `billing`, `translate`, and `analytics`.

## Key Files

| File              | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`        | Composes the top-level router (`billing`, `translate`, `analytics`). Re-exports `authed` procedure + `Ctx` type.         |
| `context.ts`      | Defines `Ctx` (env, executionCtx, auth, session) and the `authed` procedure that requires a signed-in user.              |
| `billing.ts`      | `billing.*` procedures: pricing lookup, `createCheckoutSession`, entitlement/quota reads.                                |
| `translate/`      | `translate.*` procedures: text translation endpoint (see `translate/` subdirectory).                                     |
| `analytics.ts`    | `analytics.track` — fire-and-forget PostHog event capture via `executionCtx.waitUntil`; swallows PostHog errors so they never break the response. |

## Subdirectories

| Directory    | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `translate/` | `translate.*` oRPC handlers (text translation).              |

## For AI Agents

- **Always use the `authed` procedure** for anything that reads/writes user-scoped data. Do not re-implement session checks inline.
- The `Ctx` shape is the only typed channel into request state — add fields here rather than stashing globals. `Ctx` now includes `executionCtx` for `waitUntil` fan-outs (used by `analytics.ts`).
- Router shape is exported as `Router` type and must stay in sync with `@getu/contract` — update the contract package whenever adding a route.
- `analytics.track` is intentionally fire-and-forget: PostHog failure must never propagate to the client. Keep this pattern for any future telemetry routes.

<!-- MANUAL: -->
