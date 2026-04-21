<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# dom

## Purpose

Low-level DOM toolkit shared by every content-script translation flow. Provides shadow-root-aware traversal, robust HTML/Text type guards, inline-vs-block classification (with per-host overrides and floating-letter heuristics), point-to-block-element lookup, "smash truncation style" helpers for `line-clamp`/`max-height`/`text-overflow: ellipsis`, and an animation-frame-batched DOM operation queue.

## Key Files

| File           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter.ts`    | Type guards (`isHTMLElement`, `isTextNode`, `isTransNode`, `isIFrameElement`) and classifier predicates (`isShallowInlineHTMLElement`, `isShallowBlockHTMLElement`, `isInlineTransNode`, `isBlockTransNode`, `isCustomDontWalkIntoElement`, `isCustomForceBlockTranslation`, `isDontWalkIntoButTranslateAsChildElement`, `isDontWalkIntoAndDontTranslateAsChildElement`, `isTranslatedWrapperNode`, `isTranslatedContentNode`, `hasNoWalkAncestor`, `isEditable`). Implements the "treat large floating letter as inline" exception for news sites. |
| `traversal.ts` | `extractTextContent(node, config)` — preserves leading/trailing non-newline whitespace, handles `<br>` as `\n`, recurses through children. `walkAndLabelElement(element, walkId, config)` — single-pass DOM walk that stamps `WALKED_ATTRIBUTE` + `BLOCK_ATTRIBUTE`/`INLINE_ATTRIBUTE`/`PARAGRAPH_ATTRIBUTE` and propagates `forceBlock` upward through `FORCE_BLOCK_TAGS`.                                                                                                                                                                         |
| `find.ts`      | `findElementAt(point)` — deepest element including across shadow roots. `findNearestAncestorBlockNodeAt(point)` / `findNearestAncestorBlockNodeFor(element)` — climb out of inline ancestors. `deepQueryTopLevelSelector(root, selectorFn)` — shadow-root-aware top-level selector. `unwrapDeepestOnlyHTMLChild(element)` — descend through wrapper-only ancestors and call `smashTruncationStyle`. `findTranslatedContentWrapper(node)`.                                                                                                           |
| `node.ts`      | `getOwnerDocument(node)` and `getContainingShadowRoot(node)` — single-line helpers used everywhere wrappers are created.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `style.ts`     | `smashTruncationStyle(element)` — schedules an idle/raf task to override `-webkit-line-clamp`, `max-height`, `text-overflow: ellipsis` so translated content isn't clipped.                                                                                                                                                                                                                                                                                                                                                                         |
| `batch-dom.ts` | `DOMBatcher` singleton with `requestAnimationFrame`-based queue; exports `batchDOMOperation(op)`, `flushBatchedOperations()` (test/sync escape hatch), and `createFragment(ownerDoc)`.                                                                                                                                                                                                                                                                                                                                                              |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Use the type guards (`isHTMLElement`, `isTextNode`) instead of `instanceof HTMLElement`/`Text` — those break across iframes and shadow-DOM realms. The guards intentionally check `nodeType` + duck-typed properties.
- Inline vs block uses the COMPUTED style and `FORCE_BLOCK_TAGS`. Don't rely on tag names alone — sites override `display`. The "large initial floating letter" branch (`isLargeInitialFloatingLetter`) is load-bearing for drop-cap news layouts.
- `walkAndLabelElement` mutates the DOM (sets attributes). It must run with a stable `walkId` per pass; `translate/core/translation-walker.ts` reads `getAttribute(WALKED_ATTRIBUTE) !== walkId` to bail on stale walks.
- All write-side DOM mutations (insertBefore/appendChild/remove/innerHTML) must go through `batchDOMOperation` to avoid cross-iframe layout thrash. The batcher swallows individual op errors so one broken insert doesn't kill the whole frame.
- Shadow roots: `find.ts`'s `deepQueryTopLevelSelector` and `findElementAt` recurse into `element.shadowRoot`. New traversal helpers must do the same — many host pages (YouTube, GitHub) use shadow DOM extensively.
- `smashTruncationStyle` defers via `requestIdleCallback` → `requestAnimationFrame` → `setTimeout(0)` fallback chain; preserve that order to keep animation budgets intact.
- `MAIN_CONTENT_IGNORE_TAGS` is only honored when `config.translate.page.range !== 'all'` AND the element isn't inside `<article>`/`<main>` (see `isInsideContentContainer`). Don't simplify this branch — it fixes issue #940.

### Testing Requirements

- Vitest with co-located `__tests__/`. DOM tests cover walker labelling, paragraph detection, shadow-root traversal, and batch flushing. `flushBatchedOperations()` is the synchronous escape hatch tests use to assert post-batch state.
- No `SKIP_FREE_API` involvement — these tests are pure DOM.

### Common Patterns

- Idle-time scheduling chain (`requestIdleCallback` → `requestAnimationFrame` → `setTimeout(0)`) for non-urgent style overrides.
- WeakMap/WeakSet keyed on live nodes elsewhere in `host/` — module-level state here is intentionally minimal (only the `DOMBatcher` singleton).
- Per-host overrides via `CUSTOM_DONT_WALK_INTO_ELEMENT_SELECTOR_MAP` / `CUSTOM_FORCE_BLOCK_TRANSLATION_SELECTOR_MAP` keyed by `window.location.hostname`.

## Dependencies

### Internal

- `@/types/config/config` (`Config`), `@/types/dom` (`TransNode`, `Point`)
- `@/utils/constants/dom-labels` (`BLOCK_ATTRIBUTE`, `INLINE_ATTRIBUTE`, `PARAGRAPH_ATTRIBUTE`, `WALKED_ATTRIBUTE`, `CONTENT_WRAPPER_CLASS`, `BLOCK_CONTENT_CLASS`, `INLINE_CONTENT_CLASS`, `NOTRANSLATE_CLASS`)
- `@/utils/constants/dom-rules` (`FORCE_BLOCK_TAGS`, `DONT_WALK_AND_TRANSLATE_TAGS`, `DONT_WALK_BUT_TRANSLATE_TAGS`, `MAIN_CONTENT_IGNORE_TAGS`, `CUSTOM_DONT_WALK_INTO_ELEMENT_SELECTOR_MAP`, `CUSTOM_FORCE_BLOCK_TRANSLATION_SELECTOR_MAP`)
- `@/utils/config/storage` (`getLocalConfig`)
- `@/utils/constants/config` (`DEFAULT_CONFIG`)

### External

- Web Platform only: `Element`, `HTMLElement`, `ShadowRoot`, `requestAnimationFrame`, `requestIdleCallback`, `getComputedStyle`.

<!-- MANUAL: -->
