# Sidebar Follow-up Fixes Design

**Date:** 2026-04-27
**Status:** Pending written-spec review
**Context:** Follow-up fixes for PR #212, `feat(extension): add translation sidebar`.

## Goal

Fix the first-version extension translation sidebar issues found after PR #212:

1. The model selector in the top-right does not respond; it should open a multi-model picker similar to Immersive Translate's sidebar.
2. The sidebar disappears when switching browser tabs; once opened, it should stay open across supported pages and tabs until the user explicitly closes it.
3. Source and target language controls cannot be selected while translating text.
4. Result cards and selector rows should show the matching provider/model logo instead of the current generic placeholder.
5. Sidebar UI language should follow the user's browser/computer language, or the extension UI language preference when set.

This is an incremental repair of the existing sidebar implementation, not a rewrite of the sidebar feature.

## Confirmed Decisions

- Keep the sidebar in `apps/extension/src/entrypoints/side.content`.
- Do not migrate to the browser native Side Panel API.
- Keep the existing floating-button entry and page reflow behavior.
- Persist open/closed state at extension scope: when the user opens the sidebar, all supported tabs should show it; when the user clicks close, it should stay closed.
- Put this design document under `docs/specs/`.
- Do not change document translation, billing, quota, or translation runner behavior unless directly required by these fixes.

## Out Of Scope

- Redesigning the whole sidebar visual language.
- Adding new tabs or document translation behavior.
- Reworking API quota/token accounting from PR #212.
- Adding new browser permissions.
- Changing provider configuration semantics in settings.

## Architecture

The existing `side.content` content script remains the sidebar host. The main architectural change is replacing the purely in-memory sidebar open state with a persisted extension-level UI state.

Current behavior uses:

- `isSideOpenAtom = atom(false)` in `apps/extension/src/entrypoints/side.content/atoms.ts`.
- Every tab gets a separate React/Jotai store, so switching tabs creates a fresh closed sidebar.

New behavior should introduce a small persisted UI-state atom or helper for the sidebar open flag:

- Initial value is loaded from `browser.storage.local`.
- Opening the sidebar writes `true`.
- Clicking the sidebar close button writes `false`.
- Active content-script roots watch storage changes and update their local atom when another tab changes the state.
- New content-script roots hydrate from the stored value before or during first render, so supported pages/tabs reflect the latest explicit user choice.

The state is global to the extension rather than tab-scoped. Existing site gating still applies: if `side.content` does not mount on a browser-internal or disabled site, the sidebar cannot appear there.

## Model Multi-select

The model selector should continue to use enabled translation providers from `providersConfig`, preserving the existing provider order and grouping.

Required behavior:

- Clicking the top-right trigger opens a Shadow DOM-contained multi-select popover.
- The popover supports selecting and deselecting multiple providers without closing after each toggle.
- Rows show selection state, provider logo, provider display name, and a Pro marker for GetU Pro providers.
- The trigger shows the selected provider logo stack plus selected count.
- The result card list stays in sync with the selected providers.
- The selection only affects the sidebar session. It must not disable or delete providers from settings.

Implementation should prefer the existing base-ui/select only if it reliably supports multi-select in this Shadow DOM context. If not, replace this one control with a small popover/listbox component built from existing base UI primitives.

## Language Picker

The existing `WorkbenchLanguagePicker` remains the source/target language control, but the fix must make its select interactions reliable inside the sidebar Shadow DOM.

Required behavior:

- Source language opens a selector with Auto detect plus supported language options.
- Target language opens a selector without Auto detect.
- Selecting either side updates `configFieldsAtomMap.language`.
- Swap is disabled while source is Auto detect.
- Swap is enabled when source is a concrete language and exchanges source/target.
- Popover content portals into `shadowWrapper` and has sufficient z-index to avoid being intercepted by host-page content or the resize handle.

If the existing control cannot guarantee reliable click handling, the same popover/listbox approach used for providers should be reused for language choices.

## Provider Logos

Sidebar logo rendering should be centralized so every sidebar surface resolves provider imagery consistently.

Shared behavior:

- Prefer `PROVIDER_ITEMS[provider.provider].logo(theme)`.
- Render with the shared `ProviderIcon` component.
- Fall back to provider-name initials only when no provider catalog item or logo exists.
- Use the same resolver for:
  - top-right selected provider stack,
  - provider picker rows,
  - result card headers.

DeepSeek, Qwen/Alibaba, GLM/Zhipu-style entries should therefore show their corresponding provider logos. If a specific model requires a logo different from its provider logo, add a narrow override table inside the shared resolver rather than scattering special cases across UI components.

## UI Localization

The sidebar should use the existing extension i18n stack:

- `hydrateI18nFromStorage()` at `side.content` boot.
- `baseUILocalePreferenceAtom` hydrated into the scoped `side.content` Jotai store.
- `I18nReactiveRoot` around the sidebar React tree.
- `auto` preference resolves with `browser.i18n.getUILanguage()`, then `navigator.languages` / `navigator.language`, then English.

The implementation must verify that the scoped `side.content` store receives the hydrated UI locale preference; otherwise `i18n.t()` can still render English by default in the sidebar. New or adjusted sidebar strings should be added to locale YAML files. After locale changes, run `pnpm --filter @getu/extension wxt prepare`.

## Error Handling And Edge Cases

- If storage read fails during startup, default to closed rather than unexpectedly covering pages.
- If storage watch fails or is unavailable, each tab should still hydrate the latest value on mount.
- If a provider is removed or disabled after being selected, filter it out of the selected IDs and update the visible result cards.
- If no providers are enabled, keep the existing empty provider message.
- If a language code is unsupported by the compact sidebar list, keep the disabled unsupported option behavior rather than crashing.

## Testing

Add focused tests for:

- Sidebar open state persists to storage when opened.
- Sidebar close writes `false` and prevents the sidebar from reappearing on tab switch.
- A new `side.content` root hydrates open state from storage.
- Existing roots react to stored open-state changes from another tab.
- Provider selector trigger opens a multi-select popover in the Shadow DOM.
- Selecting multiple providers updates selected IDs and result cards.
- Source and target language selectors open and update language state.
- Auto source disables swap; concrete source enables swap.
- Provider picker, provider stack, and result card use the provider logo resolver.
- `side.content` renders Chinese strings when the browser/UI locale resolves to `zh-CN`.

Validation commands should include the relevant Vitest files. For broader local validation, run extension tests with:

```bash
SKIP_FREE_API=true pnpm --filter @getu/extension test -- <relevant test files>
```

Run `pnpm --filter @getu/extension wxt prepare` after changing locale files, then run the relevant type-check or test command for the changed surface.
