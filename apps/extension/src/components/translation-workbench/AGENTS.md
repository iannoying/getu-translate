<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-27 | Updated: 2026-04-27 -->

# translation-workbench

## Purpose

Self-contained multi-provider translation workbench used by the sidebar (`side.content`) and translation-hub entrypoints. Orchestrates parallel translation requests across multiple configured providers, handles provider gating (anonymous / free / pro / enterprise plans), and renders per-provider result cards with language selection UI.

## Key Files

| File                        | Description                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                  | Core type definitions: `TranslationWorkbenchPlan`, `ProviderGate` (`available` / `login-required` / `upgrade-required`), `TranslationResultStatus`, `TranslationResultState`, `TranslationRequestSnapshot`.                                 |
| `translate-runner.ts`       | `runTranslationWorkbenchRequest(input)` — classifies providers by gate status, fires parallel translation requests via `sendMessage` (local) or `orpcClient` (Getu Pro), tracks per-provider result states, handles quota exhaustion codes. |
| `provider-gating.ts`        | `getProviderGate(provider, plan)` — pure function mapping a provider + plan to a `ProviderGate` value. `isGetuProProvider`, `buildSidebarClickRequestId`, `buildSidebarTokenRequestId` helpers.                                             |
| `language-options.ts`       | `getLanguageOptions(locale)` — returns sorted `{ value, label }` pairs for the language picker dropdown.                                                                                                                                    |
| `language-picker.tsx`       | Combobox UI for source/target language selection.                                                                                                                                                                                           |
| `provider-multi-select.tsx` | Multi-select UI for choosing which providers to run simultaneously.                                                                                                                                                                         |
| `provider-logo.tsx`         | Provider logo image component (maps `providerId` → icon asset).                                                                                                                                                                             |
| `provider-icon-stack.tsx`   | Renders a compact overlapping stack of provider logos (used in collapsed states).                                                                                                                                                           |
| `result-card.tsx`           | Displays a single provider's translation result with status-aware rendering (loading, success, error, gated states).                                                                                                                        |
| `use-auth-refresh.ts`       | Hook that refreshes the Getu Pro JWT token when it approaches expiry, keeping `orpcClient` credentials current during a workbench session.                                                                                                  |

## For AI Agents

### Working In This Directory

- **`translate-runner.ts` is the orchestration layer** — it does not render UI. Components subscribe to the result states it produces and re-render reactively.
- Provider gating logic lives exclusively in `provider-gating.ts`. Do not duplicate plan-check conditions in UI components.
- `TranslationWorkbenchPlan` drives all gating decisions. It is derived from the user's entitlement and passed down from the parent entrypoint (sidebar or translation-hub).
- Quota exhaustion (`QUOTA_EXCEEDED`, `INSUFFICIENT_QUOTA`, `FORBIDDEN`) is treated as a terminal state for that provider in the current session — do not auto-retry.
- `use-auth-refresh.ts` must be mounted at the workbench root so the token stays valid for the session duration. It has no UI output.

### Testing Requirements

- Tests in `__tests__/`. Mock `sendMessage`, `orpcClient`, and `getProviderGate` to test runner logic in isolation.
- `provider-gating.ts` is pure — test exhaustively with all plan × provider combinations.
- `language-options.ts` is pure — snapshot-test the sorted output.

### Common Patterns

- `TranslationResultState` per provider is the single source of truth for UI state. Components derive everything (spinner, error message, upgrade prompt) from `status`.
- Requests use `buildSidebarClickRequestId` / `buildSidebarTokenRequestId` to generate stable, deduplicated request IDs for the messaging layer.

## Dependencies

### Internal

- `@/utils/message` — `sendMessage` for background-worker translation dispatch.
- `@/utils/orpc/client` — `orpcClient` for Getu Pro API calls.
- `@/types/config/provider` — `TranslateProviderConfig`.
- `@/types/config/config` — `Config["language"]["level"]`.

### External

- `react`, `jotai` — UI and state.
- `@getu/definitions` — `LangCodeISO6393`.

<!-- MANUAL: -->
