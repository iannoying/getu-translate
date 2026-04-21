<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# selection-toolbar

## Purpose

The floating action bar shown after a text selection, plus the two popovers it can open: the streaming-translation popover (`translate-button/`) and the structured-output custom-action popover (`custom-action-button/`). Owns the selection state model (immutable `SelectionSession` atoms + `selectionSessionAtom`/`selectionAtom`/`contextAtom`/`isSelectionToolbarVisibleAtom`), pointer/keyboard listeners that detect when a real selection occurred (vs. clicks inside our overlay or interactive elements like buttons/links), direction-aware tooltip positioning relative to the cursor, and bridges to the background script for context-menu-driven openings (`openSelectionTranslationFromContextMenu`, `openSelectionCustomActionFromContextMenu`).

## Key Files

| File                                    | Description                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                             | `<SelectionToolbar>` — selection direction enum + offset math, mouse-up/mouse-down/selectionchange/scroll listeners, overlay/interactive guard logic (composedPath walks), inert toolbar with translate/speak/custom-action buttons and a close menu.                                                                                                                           |
| `atoms.ts`                              | Selection session model: `SelectionSession` (id, timestamp, snapshots), `selectionSessionAtom` + derived `selectionAtom`/`contextAtom`/`selectionContentAtom`, `setSelectionStateAtom`/`clearSelectionStateAtom` action atoms, `selectionToolbarTranslateRequestAtom`, and `selectionToolbarCustomActionRequestAtomFamily` (per-action request slices using `dequal` equality). |
| `close-button.tsx`                      | The hover-revealed × button at the toolbar's top-right; opens a `DropdownMenu` letting the user disable the toolbar for the current site (adds hostname to `disabledSelectionToolbarPatterns`) or globally; broadcasts `rf-dropdown-change` so the toolbar can keep itself visible while the menu is open.                                                                      |
| `speak-button.tsx`                      | Toolbar TTS button — wraps `useTextToSpeech` against the current `selectionContentAtom`; toasts when no text is selected.                                                                                                                                                                                                                                                       |
| `inline-error.ts`                       | `SelectionToolbarInlineError` model + `createSelectionToolbarPrecheckError` (i18n-keyed `actionUnavailable`/`missingSelection`/`providerDisabled`/`providerUnavailable`) and `createSelectionToolbarRuntimeError` (extracts AI SDK error message). `isAbortError()` recognizes `DOMException` aborts from `AbortController.abort()`.                                            |
| `custom-action-prompt.ts`               | Token replacement helpers for custom-action prompts (`{{selection}}`, `{{paragraphs}}`, `{{targetLanguage}}`, `{{webTitle}}`, `{{webContent}}`) plus `buildSelectionToolbarCustomActionSystemPrompt` which appends a strict YAML-style structured output contract to the user's system prompt.                                                                                  |
| `use-selection-context-menu-request.ts` | `useSelectionContextMenuRequestResolver(session)` — captures the latest right-click anchor (with 10s TTL) so when the background sends a context-menu open message, the popover can anchor at the cursor; falls back to the selection's bounding rect or viewport center.                                                                                                       |
| `use-selection-popover-snapshot.ts`     | Deep-clones the current selection/context atoms into a popover-local snapshot so the popover's data is stable even after the live `Selection` is cleared, returns a bumping `popoverSessionKey`.                                                                                                                                                                                |

## Subdirectories

| Directory               | Purpose                                                                                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translate-button/`     | The translate trigger + `<SelectionTranslationProvider>` popover: streams LLM/standard translations via `streamBackgroundText`, manages run keys / abort controllers / target-language combobox / regenerate / context-menu opening. (No nested AGENTS.md — descend if you add files.) |
| `custom-action-button/` | Custom-action triggers + `<SelectionCustomActionProvider>` popover: per-action `buildCustomActionExecutionPlan`, `streamBackgroundStructuredObject`-driven execution with thinking display, `SaveToNotebaseButton` integration. (No nested AGENTS.md — descend if you add files.)      |

## For AI Agents

### Working In This Directory

- The toolbar listeners run on `document` (mouseup/mousedown/selectionchange) and `window` (scroll). All four are needed: mousedown clears state, mouseup commits state inside `requestAnimationFrame` (so `selectionchange` has fired first), selectionchange handles keyboard-driven selection changes, scroll re-positions via rAF.
- `isMouseEventInsideSelectionOverlay` and `isSelectionInsideSelectionOverlay` walk `event.composedPath()` and shadow-root chains — they must work for portaled content (popover portals are children of `shadowWrapper`, not of the toolbar tooltip container).
- `preserveSelectionStateRef` is the flag that prevents the `selectionchange` handler from clearing state when the user clicks inside the toolbar/popovers; respect it when adding new mouse handlers.
- Direction calculation uses an 8-px `DOWNWARD_TOLERANCE` so a tiny upward drag is still treated as downward (so the toolbar appears below); preserve this constant.
- Selection sessions are append-only (`++nextSelectionSessionId`) — popovers `key={popoverSessionKey}` re-mount on every new session to discard streaming state.
- Custom-action ephemeral sessions use **negative** ids (`--nextEphemeralSessionIdRef.current`) when no real selection session exists, so they never collide with real session ids — keep this convention.
- Context-menu support requires the background script to send `openSelectionTranslationFromContextMenu` / `openSelectionCustomActionFromContextMenu` via `@/utils/message`; the resolver here owns the anchor.

### Testing Requirements

- Tests live in `__tests__/custom-action-prompt.test.ts`, `__tests__/request-rerun.test.tsx`, `__tests__/selection-toolbar.test.tsx`, `__tests__/text-wrapping.test.tsx`, `__tests__/use-selection-popover-snapshot.test.tsx`, plus per-subdir `custom-action-button/__tests__/` and `translate-button/__tests__/`.
- Run via `pnpm test`. `SKIP_FREE_API=true` skips live-network tests; mock `streamBackgroundText` / `streamBackgroundStructuredObject` in unit tests so they never reach the network.

### Common Patterns

- Selection-popover-host pattern: a single `shadowWrapper` from `..` is used as the Base UI portal `container` for the popover content and dropdown menus, with `SELECTION_CONTENT_OVERLAY_LAYERS.popover` / `popoverOverlay` for z-stacking.
- Direct DOM positioning (`tooltipRef.current.style.top/left`) instead of React state for cursor-relative placement, to avoid re-renders during scroll.
- Run-key memoization: `lastTranslationRunKeyRef` / `lastRunKeyRef` compare a JSON-serialized {sessionId, popoverSessionKey, rerunNonce, request} so the same effective request does not re-fire on unrelated re-renders.
- `AbortController` wired through provider → `translateWithLlm` → `streamBackgroundText`, with `runIdRef` versioning so a stale completion cannot overwrite newer state.
- Re-open transitions go through `requestAnimationFrame` (`reopenFrameRef`) to give Base UI time to fully close before re-opening at a new anchor.
- `selectAtom(configAtom, slice, dequal)` is used to keep request slices stable across unrelated config changes.

## Dependencies

### Internal

- `@/utils/atoms/config` (`configAtom`, `configFieldsAtomMap`, `writeConfigAtom`), `@/utils/config/helpers` (`filterEnabledProvidersConfig`, `getProviderConfigById`), `@/utils/constants/feature-providers` (`resolveProviderConfigOrNull`, `buildFeatureProviderPatch`).
- `@/utils/host/translate/*` — `prepareTranslationText`, `translateTextCore`, `getOrCreateWebPageContext`, `getOrGenerateWebPageSummary`.
- `@/utils/content-script/background-stream-client` — `streamBackgroundText`, `streamBackgroundStructuredObject`.
- `@/utils/message` — typed cross-context messaging for context-menu requests.
- `@/utils/prompts/translate`, `@/utils/providers/{model-id,options}`, `@/utils/notebase`, `@/utils/notebase-beta`, `@/utils/orpc/client`, `@/utils/auth/auth-client`, `@/utils/url` (`matchDomainPattern`).
- `@/components/ui/selection-popover` (`SelectionPopover.*`, `useSelectionPopoverOverlayProps`), `@/components/ui/base-ui/*`, `@/components/llm-providers/provider-selector`, `@/components/thinking`.
- `@/types/{analytics,background-stream,config/*}`, `@/utils/error/extract-message`, `@/utils/analytics`, `@/utils/constants/{custom-action,dom-labels,selection}`.
- `..` — `shadowWrapper`, `SELECTION_CONTENT_OVERLAY_LAYERS`, `SELECTION_CONTENT_OVERLAY_ROOT_ATTRIBUTE`, `buildContextSnapshot`, `readSelectionSnapshot`, `normalizeSelectedText`, `truncateContextTextForCustomAction`, `toLiveRange`.

### External

- `jotai` (+ `jotai/utils.selectAtom`, `jotai-family.atomFamily`), `dequal` for stable atom slices.
- `@tanstack/react-query` (`useQuery`/`useMutation` for Notebase save).
- `@base-ui/react` (Combobox primitive), `@tabler/icons-react`, `@remixicon/react`, `@iconify/react` icon packs.
- `@read-frog/definitions` — `LANG_CODE_TO_EN_NAME` for prompt substitution.
- `@json-render/{core,react}` + `zod` — structured-object renderer for custom-action outputs.
- `sonner` — error toasts (precheck failures, save errors).

<!-- MANUAL: -->
