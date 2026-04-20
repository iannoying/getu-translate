<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# translation-control

## Purpose

The control plane for the host content script's two translation modes. `page-translation.ts` owns the lifecycle of full-page translation via an `IntersectionObserver`/`MutationObserver` pipeline that walks the DOM (including shadow roots and iframes), and synchronizes `document.title` translation. `node-translation.ts` registers the hotkey and click-and-hold gestures that trigger single-paragraph translation. `bind-translation-shortcut.ts` and `handle-config-change.ts` are the small adapters that connect the manager to user shortcuts and config-driven mode switches.

## Key Files

| File                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `page-translation.ts`          | `PageTranslationManager` class: `start`/`stop`/`isActive` lifecycle, viewport-driven `IntersectionObserver` (default `rootMargin: 600px`, `threshold: 0.1`), per-`walkId` UUID tagging, deep paragraph collection across shadow roots, recursive `MutationObserver` setup that re-walks added subtrees and re-checks `style`/`class` attribute flips via `didChangeToWalkable`, document-title tracking with versioned async syncs, and a 4-finger touch gesture in `registerPageTranslationTriggers`. |
| `node-translation.ts`          | `registerNodeTranslationTriggers` — `AbortController`-scoped `mousemove`/`mousedown`/`mouseup`/`keydown`/`keyup` listeners. Implements the `clickAndHold` (1000 ms, 6 px move tolerance) and tap-and-hold-hotkey (1000 ms, "pure session") interactions. Throttles `mousemove` (300 ms / 3 px threshold). Skips `isEditable` targets. Invokes `removeOrShowNodeTranslation(point, config)`.                                                                                                            |
| `bind-translation-shortcut.ts` | Reads `config.translate.page.shortcut`, validates it via `isValidConfiguredPageTranslationShortcut`, and registers it with `HotkeyManager` from `@tanstack/hotkeys` with `ignoreInputs`/`preventDefault`/`stopPropagation`. Toggles the manager on press, tagging `start` with a `SHORTCUT` analytics surface.                                                                                                                                                                                         |
| `handle-config-change.ts`      | `handleTranslationModeChange` — when `config.translate.mode` changes while the manager is active, stop and immediately restart so the new mode is applied to the visible viewport.                                                                                                                                                                                                                                                                                                                     |

## Subdirectories

None. (`__tests__/` skipped per spec.)

## For AI Agents

### Working In This Directory

- `PageTranslationManager` is **single-instance per frame**: do not call `start()` while `isActive === true` — it self-warns and bails. Use `stop()` then `start()` (the pattern `handle-config-change.ts` follows).
- The `walkId` (UUID) tags every paragraph element with `data-read-frog-walked` so concurrent walks from different sessions don't cross-contaminate. Never reuse it across `stop()` boundaries — `stop()` nulls it and resets the cache.
- Document-title management is **top-frame only** (`shouldManageDocumentTitle()` checks `window === window.top`). The `titleRequestVersion` counter is the canonical way to discard stale async title translations — increment it on every new request and compare before applying.
- The mutation pipeline observes `attributeFilter: ["style", "class"]` and only re-walks an element when `didChangeToWalkable` returns true (i.e., it transitioned from `isDontWalkIntoButTranslateAsChildElement` to walkable). Don't widen the filter without re-tuning that gate — runaway re-translation is the failure mode.
- `node-translation.ts` re-reads config on every interaction via `getCurrentConfig()` because the script is long-lived; do not capture the config at registration time.
- Hotkey-session logic distinguishes "pure" (only the hotkey was pressed) from "tainted" (other keys mixed in) — preserve `isHotkeySessionPure` semantics when adding modifier-aware shortcuts.
- Both managers post analytics through `@/utils/analytics` (`createFeatureUsageContext` / `trackFeatureUsed`) — wrap new entry points so usage tracking stays consistent.

### Testing Requirements

Co-located `__tests__/` (already present here). Use Vitest with `happy-dom` or `jsdom`-style DOM stubs and `@/utils/message`/`@/utils/config/storage` mocks. Cover: config-mode-change restart, `walkId` invalidation across stop/start, mutation observer attribute-flip behavior, click-and-hold cancellation past `CLICK_AND_HOLD_MOVE_TOLERANCE` (6 px), hotkey session purity, and 4-finger gesture timing (`MAX_DURATION = 500 ms`, `MOVE_THRESHOLD = 900 px²`).

### Common Patterns

- `AbortController`-scoped event registration so a single `ac.abort()` removes every listener (see `node-translation.ts`).
- `getRandomUUID()`-based session tags as a substitute for full request cancellation.
- Recursive observer setup that descends into shadow roots and iframes via `observeIsolatedDescendantsMutations`.
- Versioned-async pattern (`++this.titleRequestVersion`) to ignore stale promise resolutions.
- `dontWalkIntoElementsCache` is a `WeakSet<HTMLElement>` so detached nodes don't leak.

## Dependencies

### Internal

- `@/utils/host/dom/filter` — `isEditable`, `hasNoWalkAncestor`, `isDontWalkIntoButTranslateAsChildElement`, `isHTMLElement`.
- `@/utils/host/dom/find` — `deepQueryTopLevelSelector`.
- `@/utils/host/dom/traversal` — `walkAndLabelElement` (paragraph labelling).
- `@/utils/host/translate/node-manipulation` — `translateWalkedElement`, `removeAllTranslatedWrapperNodes`, `removeOrShowNodeTranslation`.
- `@/utils/host/translate/translate-text` — `validateTranslationConfigAndToast`.
- `@/utils/host/translate/translate-variants` — `translateTextForPageTitle`.
- `@/utils/host/translate/webpage-context` — `getOrCreateWebPageContext` for AI content awareness.
- `@/utils/config/storage`, `@/utils/config/languages`, `@/utils/constants/{config,dom-labels,feature-providers,hotkeys}`, `@/utils/analytics`, `@/utils/page-translation-shortcut`, `@/utils/crypto-polyfill`, `@/utils/logger`, `@/utils/message`.
- `@/types/{analytics,config/config,config/provider,dom}`.

### External

- `@tanstack/hotkeys` — `HotkeyManager` singleton for the page-translation shortcut.

<!-- MANUAL: -->
