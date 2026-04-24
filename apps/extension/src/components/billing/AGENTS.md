<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# billing

## Purpose

Client-side UI primitives for the commercialization surface: gate children on Pro entitlement (`pro-gate.tsx`) and open the upgrade checkout dialog (`upgrade-dialog.tsx`). These are the only components that know about `entitlements` and the checkout/Paddle/Stripe flow — feature modules import from here instead of reaching into the api layer.

## Key Files

| File                                | Description                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pro-gate.tsx`                      | Wrapper that renders children only when the user is Pro; otherwise renders a fallback (often `<UpgradeDialog>` trigger).                                                               |
| `upgrade-dialog.tsx`                | Dialog that renders locale-aware pricing and dispatches `billing.createCheckoutSession` via oRPC. Honors login state — unauthenticated users are redirected to `/log-in?redirect=...`. |
| `__tests__/pro-gate.test.tsx`       | Asserts gate behaviour across Pro / free / loading states.                                                                                                                             |
| `__tests__/upgrade-dialog.test.tsx` | Asserts pricing, provider selection (Paddle vs Stripe), and CNY/USD locale rules.                                                                                                      |

## For AI Agents

- **Never duplicate gate logic.** Features that need "Pro only" UI wrap themselves in `<ProGate>`, never re-check entitlement inline.
- Locale-based currency is the contract: `zh-*` users see CNY via Stripe (Alipay + WeChat Pay), others see USD via Paddle. The dialog is the single decision point — keep `apps/api/src/billing/checkout.ts` in sync.
- The dialog reads entitlement via `useEntitlement()` / Jotai atom so Pro users see "Manage" instead of "Upgrade".
- Tests must cover both providers and both currencies; do not add a provider without a matching test.

## Dependencies

### Internal

- `@/utils/auth/auth-client` — login state.
- `@/utils/orpc/client` — `billing.createCheckoutSession`, `billing.getEntitlement`.
- `@/utils/atoms/entitlement` — Pro state atom.

### External

- `@base-ui/react` + `sonner` for dialog + toast UX.

<!-- MANUAL: -->
