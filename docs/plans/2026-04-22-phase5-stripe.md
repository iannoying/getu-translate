# Phase 5 · Stripe Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement task-by-task.
>
> **Parent:** [Phase 4 Paddle plan](2026-04-22-phase4-subscriptions.md) (merged)
> **Contract:** [`docs/contracts/billing.md`](../contracts/billing.md) v2

**Goal:** Add Stripe as a second billing provider alongside Paddle. Both providers live behind the same `billing_provider` discriminator introduced in Phase 4 T1. Users on `/price` see two buttons; extension `<UpgradeDialog>` adds a provider segmented-control.

**Architecture:** The Phase 4 DB schema + event normalizer + apply layer is already provider-agnostic. Stripe adds:
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` env/secrets
- `apps/api/src/billing/stripe/client.ts` (thin wrapper over `stripe` npm package OR raw fetch)
- `apps/api/src/billing/stripe/signature.ts` (different HMAC format from Paddle)
- `apps/api/src/billing/stripe/events.ts` (different event names)
- `POST /api/billing/webhook/stripe` (sibling to `/paddle`)
- `createCheckoutSession` input grows `provider: 'paddle' | 'stripe'` parameter
- UI adds provider selection

No schema changes. No new DB tables. Reuse everything from Phase 4.

**Tech stack:** Same as Phase 4 (`stripe` npm package) OR raw fetch — TBD in S1 based on Workers compat.

**Out of scope:**
- Payment methods beyond card (ACH, bank transfer — Phase 6+)
- Geo-routing (user picks provider manually; Q2=A in brainstorm)
- Discount codes / promo codes
- Annual → monthly downgrade flow

**Duration:** ~3.5 working days.

---

## Decisions (from brainstorming)

| Q | Decision |
|---|---|
| Parallel vs replace | Parallel — both providers live; user chooses |
| Provider selection UX | Manual: two buttons on `/price`, segmented control in `<UpgradeDialog>` |
| Pricing | Same as Paddle: $8/mo, $72/yr |
| Stripe account state | User has configured; will provide price IDs when needed for S6 |

---

## Tasks

| # | Title | Scope | Est |
|---|---|---|---|
| S0 | Contract v3: `provider` param + feature flags | `@getu/contract` + docs | 0.25d |
| S1 | Stripe API client | `apps/api` | 0.75d |
| S2 | Stripe signature verifier + event normalizer | `apps/api` | 1d |
| S3 | Webhook endpoint `/api/billing/webhook/stripe` | `apps/api` | 0.5d |
| S4 | `createCheckoutSession` supports `provider` param | `apps/api` | 0.25d |
| S5 | Web + extension UI provider selection | `apps/web` + `apps/extension` | 0.5d |
| S6 | Env/secrets + production deploy | ops | 0.25d |

**Critical path:** S0 → S1 → (S2 ∥ S4) → S3 → S5 → S6

---

## Stripe event map (for S2)

| Stripe event | Internal `BillingEvent` kind | Notes |
|---|---|---|
| `checkout.session.completed` | `subscription_activated` | with `mode='subscription'`; subscription_id in `session.subscription` |
| `customer.subscription.updated` | `subscription_updated` | read `current_period_end` |
| `customer.subscription.deleted` | `subscription_canceled` | |
| `invoice.payment_failed` | `payment_past_due` | +7d grace anchored to event.created |
| `invoice.payment_succeeded` | `payment_succeeded` | clear grace |
| other (30+) | `ignored` | |

**User mapping:** Stripe Checkout session has `client_reference_id` which we populate with `user.id` at creation time — webhook events include this to map back.

## Stripe signature format (for S2)

```
Stripe-Signature: t=<unix>,v1=<hex_hmac_sha256>
HMAC over: `${t}.${raw_body}`
Window: 5min
```

Similar to Paddle but: `,` separator vs `;`, `v1=` prefix, `.` in signed content vs `:`.

---

## Task templates

Each task follows Phase 4 pattern: TDD → spec review → code review → merge → sync → next.

**Reviewers:** Claude `code-reviewer` + `general-purpose` for spec compliance (both sonnet 4.6). No Codex.

**Commit convention:** lowercase subject, Co-Authored-By trailer.

---

## Phase 5 acceptance criteria

- [ ] All 7 tasks merged to main, tests green
- [ ] `/api/billing/webhook/stripe` live, HMAC-verified
- [ ] Stripe sandbox: checkout → entitlements row with `billing_provider='stripe'` within 30s
- [ ] `/price` page has both Upgrade buttons functional
- [ ] Extension `<UpgradeDialog>` has provider segmented-control
- [ ] Production deploy with `STRIPE_*` secrets set
- [ ] Cron retention continues working (no regression from Phase 4 T7)
