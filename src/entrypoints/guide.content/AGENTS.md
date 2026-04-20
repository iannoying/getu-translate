<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# guide.content

## Purpose

A small content script injected only on the official Read Frog marketing/onboarding site (`OFFICIAL_SITE_URL_PATTERNS`) that bridges the public web page and the extension. It listens for `read-frog-page`-sourced `window.postMessage` requests (`getPinState`, `setTargetLanguage`, `getTargetLanguage`) and replies via `window.postMessage` tagged with the kebab-cased app name (`read-frog-ext`). It also relays the background's `pinStateChanged` push so the marketing site can show whether the toolbar icon is pinned. This is the only documented mechanism for the public website to read/write a slice of the extension config.

## Key Files

| File       | Description                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `defineContentScript({ matches: OFFICIAL_SITE_URL_PATTERNS })` — wires `onMessage("pinStateChanged")` and a `window.message` listener that handles `getPinState` (round-trips to background), `setTargetLanguage` (writes `Config.language.targetCode` to WXT `local:` storage with a 500ms delay so side-content's storage watcher is mounted), and `getTargetLanguage` (reads from current config). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Match patterns come from `@/utils/constants/url#OFFICIAL_SITE_URL_PATTERNS` — do not hard-code domains here.
- The 500ms `setTimeout` before writing storage on `setTargetLanguage` is intentional: writing too early happens before the side-content React tree mounts its storage-adapter atoms, so the change would be reverted by the initial config sync — preserve this delay if you refactor.
- All inbound page messages must be filtered by `e.source !== window` (already done) and by `source === "read-frog-page"` to avoid acting on third-party `postMessage` traffic.
- Outbound messages tag themselves with `${kebabCase(APP_NAME)}-ext` (`read-frog-ext`); the public website listens for that exact source string.
- This script writes config via WXT `storage.setItem<Config>("local:" + CONFIG_STORAGE_KEY, ...)` directly rather than going through the background — keep the merge shape `{ ...config, language: { ...config.language, targetCode } }` immutable.

### Testing Requirements

Run `pnpm test` (Vitest). No co-located `__tests__/` directory currently — covered indirectly via integration of the marketing site. Live-network tests elsewhere honour `SKIP_FREE_API=true`.

### Common Patterns

- Page ↔ extension `postMessage` bridge: receive `{source: "read-frog-page", type: "..."}`, reply with `{source: "read-frog-ext", type: "...", data}`.
- Read-then-merge config writes (immutable spread) to keep storage watchers happy.
- Background-pushed events (`pinStateChanged`) are forwarded to the page verbatim.

## Dependencies

### Internal

- `@/utils/config/storage` — `getLocalConfig()`.
- `@/utils/message` — typed `onMessage`/`sendMessage`.
- `@/utils/constants/app` — `APP_NAME`.
- `@/utils/constants/config` — `CONFIG_STORAGE_KEY`.
- `@/utils/constants/url` — `OFFICIAL_SITE_URL_PATTERNS`.
- `@/types/config/config` — `Config` type for the storage write.

### External

- `case-anything` — `kebabCase` for the outbound source tag.
- `#imports` — `defineContentScript`, `storage`.

<!-- MANUAL: -->
