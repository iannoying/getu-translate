# Extension Sidebar Translation Design

**Date:** 2026-04-26
**Status:** Pending written-spec review

## Goal

Add a GetU Translate sidebar to the browser extension, modeled after the Immersive Translate sidebar screenshots, with two first-version surfaces:

1. **Text translation** with multi-provider selection.
2. **Document translation** as a UI handoff to the website at `https://getutranslate.com/document/`.

The sidebar must reuse the extension's existing floating button entrypoint and existing translation/provider foundations. It must not reintroduce in-extension PDF/document translation.

## Confirmed Decisions

- Entry uses the existing floating button surface.
- The floating button itself keeps its current behavior.
- Hovering or focusing the floating button reveals an **open panel** tab; clicking that tab opens the sidebar.
- The sidebar pushes the page left by reusing the existing `side.content` reflow behavior instead of overlaying page content.
- Version 1 includes only `Text` and `Document` tabs.
- Text provider source is the extension's existing `providersConfig`.
- Anonymous and free users can see and select Pro providers. Those providers render gated result cards after translate; they must not be called unless the user is signed in with Pro or Enterprise entitlement.
- Anonymous users selecting Pro providers see a login-required result card, not an upgrade card. The CTA opens the web login page; after login, the sidebar refreshes its signed-in state.
- Document upload opens the website in a new tab.
- Sidebar text translation limits, quota semantics, and Pro token accounting must match the website `/translate` product.
- Sidebar language controls must match the website `/translate` language picker design and wording.

## Out Of Scope

- Video, image, and tutorial tabs.
- In-extension document upload, PDF parsing, OCR, or subtitle document processing.
- Rebuilding the full website `/translate` history drawer inside the sidebar.
- Changing the floating button's existing click behavior.
- Any new browser permissions.

## Architecture

The implementation should continue to use `apps/extension/src/entrypoints/side.content`.

`SideContent` currently mounts a temporary upgrade message while already handling Shadow DOM isolation, Jotai store scope, config hydration, theming, toasts, resize, and page reflow. Replace that message with a sidebar shell rather than adding another content script.

The new sidebar should be composed as:

- `SidebarShell`: frame, title bar, close button, resize integration, active tab state, and right-side tab rail.
- `SidebarTextTranslate`: compact text translation workbench.
- `SidebarDocumentTranslate`: static document translation entry and website handoff.
- `OpenPanelButton`: hover/focus tab attached to the existing floating button cluster.

Text translation should not copy the current `translation-hub` implementation wholesale. Extract shared translation workbench logic from `entrypoints/translation-hub` into a reusable extension-side module, then let both the standalone translation hub and the sidebar render it through their own layouts.

## Text Translation Workbench

The shared workbench should own:

- Source and target language state.
- Text input state.
- Provider selection by provider id.
- A command-style translate request with a timestamp or request id so identical input can be translated again.
- Per-provider result state: idle, loading, success, error, locked.
- Result actions: copy, retry, and text-to-speech where the existing TTS hook can support it.

The sidebar layout should be compact:

- Header with "Translate text" and selected provider icon stack.
- Language picker row consistent with the website `/translate` design.
- Textarea with character count and translate button.
- Results list grouped by provider.

The standalone `translation-hub` can keep its wider two-column layout, but it should consume the same workbench logic where practical.

## Provider Model

Provider choices come from extension `providersConfig`, filtered to translation-capable enabled providers.

Provider behavior:

- Free REST providers such as Google and Microsoft can run for free users.
- GetU Pro providers remain visible and selectable for anonymous and free users.
- Anonymous users selecting GetU Pro providers get login-required result cards after clicking Translate. The card CTA opens `${WEBSITE_URL}/log-in` in a new tab.
- Logged-in free users selecting GetU Pro providers get Pro-upgrade result cards after clicking Translate.
- Pro and Enterprise users can invoke GetU Pro providers.
- User-configured BYOK providers can run through the existing extension `executeTranslate` pipeline and should not consume GetU Pro token quota.

Provider ordering should follow the existing config order. Removing a provider from the picker should only affect the local sidebar/hub selection, not delete or disable it in settings.

The sidebar should read auth state through the existing extension `authClient.useSession()` path. After a login CTA opens the website and the user completes login, the sidebar should refresh session and entitlements when the original tab regains focus or visibility. A page reload must not be required for the sidebar to show the logged-in state.

## Limits, Quota, And Token Accounting

The sidebar must match the website `/translate` text product:

- Free input limit: `2,000` characters.
- Pro and Enterprise input limit: `20,000` characters.
- The frontend should show the same limit semantics and upgrade path as the website.
- Backend validation remains authoritative.
- One Translate click should share one `clickId` across all provider calls so the monthly text-click quota behaves like the website.
- GetU Pro LLM usage should be charged against the same Pro text token bucket used by `/translate`: `web_text_translate_token_monthly`.
- The model coefficient registry used by the website `/translate` product should be the source of truth for text-translation Pro token accounting.
- If extension GetU Pro provider model ids are missing from that registry, implementation must add or align explicit mappings before enabling metered calls.
- If existing web/API code has incomplete token-bucket consumption for `/translate`, implementation should close that gap as shared backend behavior rather than estimating token spend in the sidebar.

BYOK providers are different: their cost is paid by the user's own API credentials, so they should obey the same input length limit but should not spend GetU Pro token quota.

## Language Design

The sidebar language controls should visually and behaviorally match the website `/translate` language picker:

- Same source/target control structure.
- Same `auto` source-language behavior.
- Same swap button rule: swapping is disabled while source is auto.
- Same display names and localized labels.
- Same character-limit presentation.

If the extension uses ISO-639-3 internally while the website uses a different language id shape, add an adapter at the shared workbench boundary. Do not fork the UI copy or behavior.

## Document Translation Tab

The document tab should mirror the screenshot's information hierarchy:

- Title: document translation.
- Short explanation of supported formats.
- Format grid: PDF, EPUB, HTML, TXT, DOCX, Markdown, and subtitle formats.
- Primary upload button.
- Small feature blocks for PDF Pro, BabelDOC, and subtitle files.

Clicking the upload button opens `WEB_DOCUMENT_TRANSLATE_URL` in a new tab through `browser.tabs.create`. The sidebar may append `?src=<encoded current URL>` when useful, but the website remains responsible for all actual upload and translation work.

## Error Handling

Errors are isolated per provider. A failure in one provider must not clear the input or block other provider cards.

Required states:

- Not signed in.
- Character limit exceeded.
- Anonymous user selected Pro provider.
- Logged-in free user selected Pro provider.
- Provider config missing.
- Provider disabled between selection and translate.
- Provider request/network failure.
- GetU Pro quota or token quota exhausted.
- Extension context invalidated while a request is in flight.

User-facing copy for character limits, quota exhaustion, and Pro upgrade should match the website `/translate` wording where possible.

The login-required card should be distinct from the Pro-upgrade card: anonymous users are asked to log in first, while logged-in free users are asked to upgrade.

## Testing

Add focused tests around:

- Floating button body behavior remains unchanged.
- Hover/focus open-panel tab appears and opens the sidebar.
- Sidebar tab switching between Text and Document.
- Sidebar resize and page reflow still work.
- Language picker swap and auto-source behavior match `/translate`.
- Anonymous user selecting a Pro provider does not call the provider and renders a login-required result card.
- Login CTA opens `${WEBSITE_URL}/log-in` in a new tab, and session refresh updates the sidebar after login.
- Logged-in free user selecting a Pro provider does not call the provider and renders a Pro-upgrade result card.
- Pro user selecting a GetU Pro provider can invoke it.
- BYOK provider path does not spend GetU Pro token quota.
- Character limits match Free and Pro plan limits.
- One translate click shares a request id across selected provider calls.
- Document upload opens `WEB_DOCUMENT_TRANSLATE_URL` in a new tab.

Run extension tests with `SKIP_FREE_API=true`.

## Implementation Notes

- Keep all dropdowns, popovers, and toasts inside the sidebar Shadow DOM by using the existing `shadowWrapper` portal pattern.
- Keep `side.content`'s scoped Jotai store. Do not switch to the default store.
- Do not mutate `enablePageTranslationAtom` directly; existing page-translation toggles still go through background messaging.
- Avoid new dependencies. Existing React, Jotai, TanStack Query, shadcn/base-ui, and provider utilities are sufficient.
- After adding or changing locale keys, run `pnpm wxt prepare` before type-checking.
