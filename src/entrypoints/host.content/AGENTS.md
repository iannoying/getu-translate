<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# host.content

## Purpose

Content script injected into every host page (`*://*/*`, `file:///*`, all frames) that powers Read Frog's immersive page-translation feature. It guards against double injection, honors the per-site control allowlist, mounts a Shadow DOM toast host on the top frame, wires up URL-change detection for SPAs, and hands off to `runtime.ts` which orchestrates the `PageTranslationManager`, node-translation triggers, and translation-shortcut binding.

## Key Files

| File                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`            | WXT `defineContentScript` entry. Sets `window.__READ_FROG_HOST_INJECTED__` guard, checks `isSiteEnabled` against site-control URL, then dynamic-imports `bootstrapHostContent` from `./runtime`.                                                                                                                                                                                                                                                               |
| `runtime.ts`           | Bootstraps the host runtime: ensures preset styles, mounts the toast host (top frame only), instantiates `PageTranslationManager` with `IntersectionObserver` preload margin from config, registers node-translation triggers and the translation hotkey, listens for `askManagerToTogglePageTranslation` messages, syncs detected language into `local:DETECTED_CODE_STORAGE_KEY`, and wires `extension:URLChange` handling plus `ctx.onInvalidated` cleanup. |
| `listen.ts`            | `setupUrlChangeListener` patches `history.pushState`/`replaceState`, listens to `popstate`/`hashchange`, hooks the modern Navigation API on Chromium, and falls back to 1s polling on Firefox/Safari. Filters out same-origin+pathname noise and dispatches the synthetic `extension:URLChange` CustomEvent with `{ from, to, reason }`.                                                                                                                       |
| `mount-host-toast.tsx` | Builds an isolated Shadow DOM host (`data-read-frog-host-toast`), injects the inlined theme CSS via `ShadowHostBuilder`, renders `<FrogToast />` with the `NOTRANSLATE_CLASS` wrapper, and returns an idempotent cleanup function.                                                                                                                                                                                                                             |

## Subdirectories

| Directory              | Purpose                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translation-control/` | Page- and node-translation control surfaces: `PageTranslationManager`, hotkey binding, mode-change handler, and node-translation trigger registry (see `translation-control/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- The script runs in **all frames**; treat anything that mutates global state, calls APIs, or reads `document.title` with a `window === window.top` guard like `runtime.ts` does for language detection and the toast host.
- Never call `mountHostToast()` outside the top frame — it appends to `document.body`/`document.documentElement` and would duplicate UI inside iframes.
- All teardown must flow through `ctx.onInvalidated` to clear the `__READ_FROG_HOST_INJECTED__` flag and call `clearEffectiveSiteControlUrl()`; otherwise a re-injection after extension reload will silently no-op.
- When adding new browser-side listeners, prefer `AbortSignal`-based registration like `node-translation.ts` so a single `controller.abort()` cleans them all up.
- Cross-context messaging uses `@/utils/message`. The script both sends (`getEnablePageTranslationFromContentScript`, `checkAndAskAutoPageTranslation`) and listens (`askManagerToTogglePageTranslation`) — keep the schemas in `src/utils/message/` in sync.
- The site-control gate runs **twice**: at the top of `index.tsx` (early bail) and again as `enablePageTranslationAtom` is hydrated downstream — do not collapse those checks.

### Testing Requirements

Vitest with co-located `__tests__/` folders. There are no top-level tests in this directory today (translation-control has its own `__tests__/`). Add tests under a sibling `__tests__/<file>.test.ts` and mock `#imports`, `@/utils/message`, and `@/utils/config/storage` directly — do not import the entrypoint default export, exercise the helpers (`setupUrlChangeListener`, `mountHostToast`, `bootstrapHostContent`).

### Common Patterns

- Dynamic import of `./runtime` after the site-control check keeps the cold-injection path tiny.
- "Same-page" URL changes (origin+pathname identical) are filtered before firing `extension:URLChange` to avoid re-translating on hash anchor jumps.
- `IntersectionObserver` preload geometry comes from `config.translate.page.preload` (margin in px, threshold 0–1) and is forwarded straight to the manager constructor.
- Late-loading iframes self-recover by calling `getEnablePageTranslationFromContentScript` on bootstrap and starting the manager when the top frame already has translation on.

## Dependencies

### Internal

- `@/utils/config/storage` — `getLocalConfig` for initial config snapshot.
- `@/utils/site-control` — `isSiteEnabled`, `getEffectiveSiteControlUrl`, `clearEffectiveSiteControlUrl`.
- `@/utils/message` — typed `sendMessage`/`onMessage` over `@webext-core/messaging`.
- `@/utils/host/translate/ui/style-injector` — `ensurePresetStyles` for translated-text presets.
- `@/utils/content/analyze` — `getDocumentInfo` for language detection.
- `@/utils/react-shadow-host/shadow-host-builder` — Shadow DOM container builder used by the toast.
- `@/utils/constants/dom-labels`, `@/utils/constants/config`, `@/utils/styles`, `@/utils/logger`.
- `@/components/frog-toast` — the toast UI rendered in the host frame.

### External

- `wxt` (`#imports`) — `defineContentScript`, `storage`, `i18n`.
- `react` / `react-dom` — toast renderer.
- `@read-frog/definitions` — `LangCodeISO6393` typing for detected-language storage.

<!-- MANUAL: -->
