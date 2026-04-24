<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# paddle

## Purpose

Paddle (Billing) integration for USD subscriptions. Splits cleanly into client HTTP calls, webhook event parsing, signature verification, and DB application.

## Key Files

| File              | Description                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `client.ts`       | Thin HTTP client for Paddle's REST API (`createTransaction`, price lookup, etc.).                             |
| `events.ts`       | Zod schemas + discriminated-union type for the webhook event payloads we care about.                          |
| `signature.ts`    | HMAC-SHA256 signature verifier (`paddle-signature` header). Also exports a helper to sign fixtures in tests.   |
| `apply.ts`        | `applyPaddleEvent(db, event)` — translates a parsed event into DB writes (entitlement create/update/cancel).   |
| `__tests__/*.test.ts` | Full coverage: client (mocked fetch), events (fixture parsing), signature (valid+invalid), apply (DB state). |

## For AI Agents

- Keep `events.ts` strict: unknown event types should either be added with tests or explicitly ignored in `apply.ts`.
- `signature.ts` should never be relaxed for local testing — tests compose real signatures.
- Idempotency: `apply.ts` must be safe to call twice with the same event.

<!-- MANUAL: -->
