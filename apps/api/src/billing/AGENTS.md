<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# billing

## Purpose

Entitlement + quota engine and provider-specific integrations for **Paddle** (subscription + one-time) and **Stripe** (one-time with Alipay / WeChat Pay / cards). Drives:

- `createCheckoutSession` (exposed via oRPC `billing.*`) → dispatches to Paddle or Stripe per locale/mode.
- Webhook handlers that apply entitlement changes.
- Quota + period math used by the AI proxy and the extension UI.

## Key Files

| File                          | Description                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `entitlements.ts`             | `getEntitlement(db, userId)` — resolves whether a user is Pro, tier, current period.                                |
| `quota.ts`                    | Period-windowed quota counters (AI tokens, wordbook slots, etc.). Used by the AI proxy + extension.                 |
| `period.ts`                   | Billing period math (start/end of cycle given an entitlement).                                                     |
| `checkout.ts`                 | `createCheckoutSession(...)` dispatcher: picks provider by `mode` / locale.                                         |
| `webhook-handler.ts`          | `handlePaddleWebhook` — verifies signature, parses event, calls `paddle/apply.ts`.                                  |
| `stripe-webhook-handler.ts`   | `handleStripeWebhook` — verifies signature, parses event, applies entitlement changes.                              |
| `__tests__/*.test.ts`         | Unit tests for each module (checkout dispatch, entitlements, period, quota, both webhook handlers).                 |

## Subdirectories

| Directory  | Purpose                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `paddle/`  | Paddle HTTP client, event parsing, signature verification, `apply()` to DB.                                          |
| `stripe/`  | Stripe HTTP client, event parsing, signature verification.                                                           |

## For AI Agents

### Working In This Directory

- **Currency rules**: CNY is one-time only (Alipay + WeChat Pay via Stripe). USD uses Paddle subscriptions. Keep `checkout.ts` as the single dispatch point.
- **Signatures are mandatory.** Never bypass signature verification, even for "local testing" — use the test helpers in `paddle/signature.ts` / `stripe/signature.ts` to construct valid payloads in tests.
- **Webhook handlers are idempotent.** Events may redeliver — check existing DB state before applying.
- Entitlement changes are the source of truth for Pro access; never key Pro off a raw subscription row.
- If adding a provider, mirror the `paddle/` layout: `client.ts`, `events.ts`, `signature.ts`, `apply.ts`, and full `__tests__/`.

### Testing Requirements

- `pnpm --filter @getu/api test` covers this directory heavily. A new provider or event type MUST ship with a signature test + an apply test.
- Mock HTTP calls; tests never hit Paddle/Stripe.

## Dependencies

### Internal

- `@getu/db` — reads/writes `schema.billing.*`.

### External

- `zod` — event payload parsing.
- Web Crypto — signature HMAC.

<!-- MANUAL: -->
