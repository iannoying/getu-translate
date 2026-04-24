<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# orpc

## Purpose

Server-side oRPC router implementing the `@getu/contract` contract. Mounted at `/orpc/*` in `src/index.ts`. Currently exposes the `billing.*` domain; add more domains as namespaced sub-routers.

## Key Files

| File              | Description                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `index.ts`        | Composes the top-level router. Re-exports `authed` procedure + `Ctx` type.                                       |
| `context.ts`      | Defines `Ctx` (env, auth, session) and the `authed` procedure that requires a signed-in user.                    |
| `billing.ts`      | `billing.*` procedures: pricing lookup, `createCheckoutSession`, entitlement/quota reads.                        |
| `__tests__/billing.test.ts` | Tests against an in-memory DB using `utils/test-db.ts`.                                                |

## For AI Agents

- **Always use the `authed` procedure** for anything that reads/writes user-scoped data. Do not re-implement session checks inline.
- The `Ctx` shape is the only typed channel into request state — add fields here rather than stashing globals.
- Router shape is exported as `Router` type and must stay in sync with `@getu/contract`'s contract — regenerate/update the contract package whenever adding a route.

<!-- MANUAL: -->
