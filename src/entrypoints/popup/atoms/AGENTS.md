<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# atoms

## Purpose

Popup-scoped Jotai atoms that hold ephemeral tab-derived state (whether the active tab is "ignore", whether its URL matches the auto-translate / whitelist / blacklist patterns, whether the page is currently translated) and the write-only action atoms that toggle those memberships and persist them back into `configFieldsAtomMap.translate` / `configFieldsAtomMap.siteControl`. These atoms are seeded by `main.tsx` via `useHydrateAtoms` so the popup opens with correct values without a flash.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto-translate.ts` | `isCurrentSiteInPatternsAtom` (sync bool) + `isPageTranslatedAtom`; async helpers `getIsInPatterns(translateConfig)` and `initIsCurrentSiteInPatternsAtom`; write-only `toggleCurrentSiteAtom` adds/removes the active hostname in `translate.page.autoTranslatePatterns` using `matchDomainPattern`.          |
| `ignore.ts`         | `isIgnoreTabAtom` + `isIgnoreUrl(url)` — substring-matches `about:blank`, `chrome://newtab/`, `edge://newtab/`, `about:newtab`, and any extension-scheme URL.                                                                                                                                                  |
| `site-control.ts`   | `isCurrentSiteInWhitelistAtom` / `isCurrentSiteInBlacklistAtom` + `isInSiteControlList(patterns, url)`; shared `toggleSiteInPatterns(get, set, checked, key)` reloads the active tab via `browser.tabs.reload` after writing; exposes `toggleCurrentSiteInWhitelistAtom` / `toggleCurrentSiteInBlacklistAtom`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- These atoms are intentionally **not** reactive to URL changes — the popup is short-lived, so values are hydrated once and updated only by user toggles.
- All membership checks go through `matchDomainPattern` from `@/utils/url`; do not compare hostnames directly or you will miss wildcard / suffix patterns.
- Toggling whitelist or blacklist triggers `browser.tabs.reload` of the active tab; toggling auto-translate patterns does **not** reload — it only updates persisted config.
- When adding new tab-derived state, hydrate it from `popup/main.tsx` rather than triggering an effect on mount.
- `toggleCurrentSiteAtom` writes a partial config into `configFieldsAtomMap.translate` (just the `page` slice), relying on the config atom's merge behavior — preserve that pattern.

### Testing Requirements

`pnpm test` (Vitest). No tests currently co-located here; tests for `isIgnoreUrl` / `matchDomainPattern` would live alongside in `__tests__/`. Not affected by `SKIP_FREE_API`.

### Common Patterns

- Pair: a sync bool atom holding the current state + a write-only async atom that mutates persisted config and updates the bool. Consumers read the bool with `useAtomValue` and call the action with `useSetAtom` / `useAtom`.

## Dependencies

### Internal

- `@/utils/atoms/config` (`configFieldsAtomMap.translate`, `configFieldsAtomMap.siteControl`)
- `@/utils/url` (`matchDomainPattern`)
- `@/utils/utils` (`getActiveTabUrl`)
- `@/types/config/config`

### External

- `jotai` (`atom`, `Getter`, `Setter`)
- `#imports` (WXT auto-imports — `browser` for `tabs.query` / `tabs.reload`)

<!-- MANUAL: -->
