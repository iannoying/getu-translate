<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-24 | Updated: 2026-04-24 -->

# upgrade-success

## Purpose

Standalone HTML page shown after a successful Paddle / Stripe checkout returns the user to the extension. Confirms the upgrade, refreshes the local `entitlements` mirror from the api, and links the user back into the options page / translation hub.

## Key Files

| File           | Description                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `index.html`   | WXT page entry (`upgrade-success.html` in the build).                                                      |
| `main.tsx`     | React bootstrap: Jotai + QueryClient + Theme providers, re-fetches entitlement, renders success UI.        |

## For AI Agents

- This page is the **client-visible side effect** of a successful checkout. It must be resilient to webhook lag — if entitlement still reads as Free, retry with backoff before showing an error.
- Deep links from external sites (Paddle/Stripe redirect URLs) land here; keep the page idempotent and side-effect-free beyond the entitlement refresh.
- Localize all copy via `i18n.t(...)` — this page ships with both `en` and `zh-*` users.

<!-- MANUAL: -->
