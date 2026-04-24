<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# stripe

## Purpose

Stripe integration for **one-time** payments (currently CNY with Alipay + WeChat Pay). Subscriptions go through Paddle — keep Stripe scoped to one-time checkout.

## Key Files

| File           | Description                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `client.ts`    | Stripe REST client (`createCheckoutSession` with `payment_method_types` explicitly set).             |
| `events.ts`    | Zod parsers for the webhook events we apply (`checkout.session.completed`, etc.).                    |
| `signature.ts` | Stripe `Stripe-Signature` verifier + fixture signer for tests.                                       |
| `__tests__/*.test.ts` | Tests per file.                                                                               |

## For AI Agents

- **Do not set `mode: "subscription"`.** One-time only.
- `payment_method_types` must be explicit — leaving it off breaks the CNY flow.
- WeChat Pay is incompatible with USD; gate it at the dispatcher (`billing/checkout.ts`).
- User lookup on webhook uses session metadata — never trust client-supplied userId.

<!-- MANUAL: -->
