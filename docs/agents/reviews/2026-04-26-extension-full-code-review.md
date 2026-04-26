# Chrome Extension Full Code Review - 2026-04-26

Scope: `apps/extension` in the GetU Translate monorepo. This was a read-only
review of Chrome extension risk areas: MV3 manifest and service-worker
lifecycle, content scripts and DOM mutation, popup/options/translation-hub
state, runtime messaging, storage consistency, permissions, async races, error
handling, security, and validation coverage.

## Validation Run

- `pnpm --filter @getu/extension type-check` passed.
- `pnpm --filter @getu/extension lint` passed with 2 existing warnings:
  - `apps/extension/src/entrypoints/selection.content/selection-toolbar/save-word-button/provider.tsx:22`
  - `apps/extension/src/utils/extension-lifecycle.ts:117`
- `SKIP_FREE_API=true pnpm --filter @getu/extension test -- --exclude="**/free-api.test.ts"` passed:
  - 158 test files passed, 1 skipped.
  - 1357 tests passed, 4 skipped.
- I did not run `wxt build` in this review pass because it writes
  `apps/extension/output`; generated-manifest validation is listed as a gap.

## Findings

### 1. Translation-only page translation injects provider output as HTML

- Severity: high
- File and line:
  `apps/extension/src/utils/host/translate/core/translation-modes.ts:302`
- Why this is a real bug or risk:
  Translation-only mode assigns `translatedText` directly to
  `translatedWrapperNode.innerHTML`. That value comes from the selected
  translation provider or LLM. The content script runs on `*://*/*`,
  `file:///*`, and all frames, so a prompt-injected or compromised translation
  response can become active DOM on any translated page. Bilingual mode uses
  `textContent` in `translation-insertion.ts:111`, so this risk is specific to
  translation-only mode.
- Reproduction path:
  Set page translation mode to `translationOnly`. Mock `translateTextForPage`
  or use a provider response returning
  `<img src=x onerror="window.__getuXss=1">`. Trigger page translation. The
  payload is parsed into the host page DOM instead of being rendered as inert
  text.
- Suggested minimal fix:
  Use `textContent` for provider output by default. If markup preservation is a
  product requirement, parse into an inert document and reconstruct only a small
  allowlist of safe tags and attributes; strip scripts, event-handler
  attributes, forms, iframes, style, and unsafe URL protocols.
- Test should be added:
  Yes. Add a translation-only DOM test mocking `translateTextForPage` to return
  an element with an event-handler attribute and assert it is rendered as inert
  text or sanitized markup.

### 2. MV3 translation queue message handlers register after an async config read

- Severity: high
- File and line:
  `apps/extension/src/entrypoints/background/translation-queues.ts:216` and
  `apps/extension/src/entrypoints/background/translation-queues.ts:291`
- Why this is a real bug or risk:
  `setUpWebPageTranslationQueue()` and `setUpSubtitlesTranslationQueue()` await
  `ensureInitializedConfig()` before registering their `onMessage` handlers at
  lines 227 and 301. In MV3, service workers can be woken by the very message
  that needs the listener. If the worker was evicted and a first translation
  request arrives during config initialization, Chrome can dispatch before the
  listener exists, producing a missing-receiver failure.
- Reproduction path:
  Let the service worker go idle. Trigger page or subtitle translation from a
  content script while config initialization is slow, for example by delaying
  storage reads in tests. The first `enqueueTranslateRequest` or
  `enqueueSubtitlesTranslateRequest` can fail before handlers are registered.
- Suggested minimal fix:
  Register all queue message handlers synchronously in `main()`. Inside each
  handler, await a memoized queue-initialization promise before using the queue.
- Test should be added:
  Yes. Make `ensureInitializedConfig()` return an unresolved promise, call setup
  without awaiting it, and assert both queue handlers are already registered.

### 3. Custom GetU Pro provider ids are dropped during v072 to v073 migration

- Severity: high
- File and line:
  `apps/extension/src/utils/config/migration-scripts/v072-to-v073.ts:98`
- Why this is a real bug or risk:
  The migration removes every provider whose `provider` is `getu-pro` and
  replaces them with fixed ids. It does not remap feature references,
  language-detection references, or custom-action references that point at a
  removed GetU Pro id. `configSchema.superRefine()` rejects missing provider
  ids, and `initializeConfig()` falls back to `DEFAULT_CONFIG` when migrated
  config validation fails. A user can therefore lose their whole config after
  upgrade.
- Reproduction path:
  Start from a v072 config with an additional `getu-pro` provider id such as
  `getu-pro-custom`, set `translate.providerId` or a custom action provider to
  that id, then run migration v072 to v073 and validate with `configSchema`.
  The referenced id no longer exists in `providersConfig`.
- Suggested minimal fix:
  Either preserve user-created `getu-pro` entries or remap all removed GetU Pro
  ids in feature providers, language detection, and custom actions to
  `getu-pro-default`.
- Test should be added:
  Yes. Add migration tests for a non-default GetU Pro id referenced by page
  translation, language detection, and selection custom actions.

### 4. Firefox builds expose TTS controls that call Chrome offscreen-only paths

- Severity: medium
- File and line:
  `apps/extension/src/entrypoints/selection.content/selection-toolbar/translate-button/translation-content.tsx:39`
  and
  `apps/extension/src/entrypoints/selection.content/components/selection-source-content.tsx:52`
- Why this is a real bug or risk:
  Firefox builds omit the `offscreen` permission, and
  `ensureOffscreenDocument()` throws when `chrome.offscreen.createDocument` is
  unavailable in `background/tts-playback.ts:73`. The main selection toolbar
  hides one speak button in Firefox, but translated-result and source-content
  popovers still render `SpeakButton` unconditionally and call
  `ttsPlaybackEnsureOffscreen` via `use-text-to-speech.tsx:162`.
- Reproduction path:
  Build or run the Firefox extension. Translate selected text, then click the
  speak button in the translation result or expanded source-content actions.
  Playback fails with `Offscreen API is unavailable in this browser`.
- Suggested minimal fix:
  Gate every selection TTS entry point with `import.meta.env.BROWSER !==
  "firefox"` or implement a caller-context audio playback fallback for Firefox.
- Test should be added:
  Yes. Add Firefox-mode component tests for selection result/source actions and
  a background test that documents unavailable offscreen behavior.

### 5. Cleanup alarm listener is registered after awaited alarm reads

- Severity: medium
- File and line:
  `apps/extension/src/entrypoints/background/db-cleanup.ts:23`
- Why this is a real bug or risk:
  `setUpDatabaseCleanup()` awaits three `browser.alarms.get()` calls before
  registering `browser.alarms.onAlarm.addListener()` at line 54. If a cleanup
  alarm wakes the MV3 worker, the alarm event can be delivered before the
  listener is registered, so that cleanup tick is lost.
- Reproduction path:
  In a test, make `browser.alarms.get()` hang or resolve slowly, call
  `setUpDatabaseCleanup()`, and dispatch an alarm before line 54 runs. No
  cleanup handler exists yet.
- Suggested minimal fix:
  Register the `onAlarm` listener synchronously first, then perform async alarm
  creation/checking.
- Test should be added:
  Yes. Assert `alarms.onAlarm.addListener` is called before awaiting unresolved
  `alarms.get()` promises.

### 6. PDF content-type tab state is lost across service-worker eviction

- Severity: medium
- File and line:
  `apps/extension/src/entrypoints/background/pdf-tab-detect.ts:4`
- Why this is a real bug or risk:
  `pdfTabs` is an in-memory service-worker set. It correctly catches top-frame
  `Content-Type: application/pdf` responses for URLs without a `.pdf` suffix,
  but that state disappears when the MV3 worker is evicted. Already-open PDFs
  whose URL does not end in `.pdf` will later report `isTabPdf() === false`.
- Reproduction path:
  Open a PDF served from a non-`.pdf` URL, for example a CMS/download endpoint
  with `Content-Type: application/pdf`. Wait for the background worker to idle
  and be evicted. Open the popup. `isTabPdf` returns false and the PDF shortcut
  is hidden.
- Suggested minimal fix:
  Persist the observed PDF flag in `storage.session`, keyed by tab id, and clear
  it on tab removal and main-frame non-PDF navigation. Alternatively recompute
  from a persisted header observation plus URL suffix.
- Test should be added:
  Yes. Add a lifecycle-style test that records a PDF header observation, resets
  module state, and verifies the popup path can still identify the tab.

### 7. API Providers opens a hidden GetU Pro provider for free users

- Severity: medium
- File and line:
  `apps/extension/src/entrypoints/options/pages/api-providers/atoms.ts:14`
- Why this is a real bug or risk:
  `selectedProviderIdAtom` defaults to the first API provider from the full
  config. `DEFAULT_PROVIDER_CONFIG_LIST` starts with GetU Pro providers, while
  `ProviderCardList` filters those entries for non-Pro users at
  `providers-config.tsx:57`. A free user can see a rail without Pro providers
  while the editor opens a hidden Pro provider.
- Reproduction path:
  Fresh/free profile, open Options > API Providers. The visible provider rail
  filters `getu-pro`, but `ProviderConfigForm` still uses the selected id from
  the unfiltered list and renders a hidden provider's form.
- Suggested minimal fix:
  Derive the initial selected provider from the visible provider list, or run a
  correction effect that switches selection to the first visible provider when
  the current selected id is filtered out.
- Test should be added:
  Yes. Add a component test with non-Pro entitlements and default config.

### 8. Translation hub keeps stale selected provider ids after config changes

- Severity: medium
- File and line:
  `apps/extension/src/entrypoints/translation-hub/atoms.ts:40`
- Why this is a real bug or risk:
  Once `selectedProviderIdsOverrideAtom` is set, `selectedProviderIdsAtom`
  returns it without intersecting it with the current enabled translate-provider
  ids. If another options tab disables or deletes a selected provider, the hub
  still counts the stale id; deleted providers produce blank selected state, and
  disabled providers can still be rendered and used.
- Reproduction path:
  Open Translation Hub and select a provider. In Options, disable or delete that
  provider. Return to the hub. The dropdown count and panel state can still use
  the stale id even though the provider is no longer selectable.
- Suggested minimal fix:
  Derive selected ids through the current enabled translate-provider id set and
  prune invalid ids whenever config changes.
- Test should be added:
  Yes. Add an atom or component test for disabling and deleting a selected
  provider after an override has been set.

### 9. Official-site guide bridge writes unvalidated config and skips config meta

- Severity: medium
- File and line:
  `apps/extension/src/entrypoints/guide.content/index.ts:31`
- Why this is a real bug or risk:
  The guide content script accepts `window.postMessage` from pages matching the
  official site patterns and writes `e.data.langCodeISO6393` directly into
  `local:config` with `storage.setItem`. It does not validate the language code
  with `configSchema` and does not update storage meta (`schemaVersion` or
  `lastModifiedAt`). Bad page data can leave an invalid config in storage, and
  config sync/backup code can observe stale metadata.
- Reproduction path:
  On a matched guide page, run
  `window.postMessage({source:"read-frog-page", type:"setTargetLanguage",
  langCodeISO6393:"not-a-lang"}, "*")`. The content script writes an invalid
  target language into `local:config`.
- Suggested minimal fix:
  Validate the incoming language with `langCodeISO6393Schema` and persist via
  `setLocalConfig()` or `writeConfigAtom` equivalent logic that updates config
  meta. Reject malformed messages.
- Test should be added:
  Yes. Add guide content-script tests for invalid language rejection and meta
  update on valid language changes.

### 10. backgroundFetch logs full request/response payloads in dev builds

- Severity: low
- File and line:
  `apps/extension/src/entrypoints/background/proxy-fetch.ts:88`,
  `apps/extension/src/entrypoints/background/proxy-fetch.ts:72`, and
  `apps/extension/src/entrypoints/background/proxy-fetch.ts:168`
- Why this is a real bug or risk:
  The logger is dev-only, but dev builds still print full proxied request data,
  response bodies, and cookie-change values. DeepL sends API keys in
  `Authorization` headers, and DeepLX can embed API keys in URLs. Auth and oRPC
  responses can also contain user/account data. These values can leak through
  service-worker console logs, shared screenshots, or copied diagnostics.
- Reproduction path:
  Run a dev build and trigger DeepL translation or an auth-backed
  `backgroundFetch`. Open the extension service-worker console. The full
  request or response data is logged.
- Suggested minimal fix:
  Remove these payload logs or redact headers, URLs, cookies, request bodies,
  and response bodies before logging. Keep only method, origin, status, cache
  group, and timing.
- Test should be added:
  Yes. Add a small redaction-unit test if logging is retained.

### 11. Translation-hub language detection can apply stale async results

- Severity: low
- File and line:
  `apps/extension/src/entrypoints/translation-hub/components/language-control-panel.tsx:22`
- Why this is a real bug or risk:
  The debounced async `detectLanguage()` call sets `detectedSourceLangCode`
  without checking whether the result still belongs to the latest input text.
  With LLM detection enabled, an older slower request can resolve after a newer
  faster request and show the wrong detected source language.
- Reproduction path:
  Enable LLM language detection. Type text A, then quickly replace it with text
  B. If the A detection promise resolves after B, the UI can show A's detected
  language for B.
- Suggested minimal fix:
  Track a monotonically increasing request id or compare captured text with the
  latest input before setting `detectedSourceLangCode`.
- Test should be added:
  Yes. Add a test with two deferred `detectLanguage` promises resolving out of
  order.

## Validation and Coverage Gaps

### 12. No real Chrome MV3 runtime smoke test

- Severity: high
- File and line:
  `apps/extension/vitest.config.ts:12` and `.github/workflows/pr-test.yml:44`
- Why this is a real bug or risk:
  Current validation uses Node-environment Vitest, lint, type-check, and WXT
  build. It does not load the unpacked extension in Chromium, so service-worker
  wakeups, permissions, content-script isolated/main worlds, CSP, and real
  extension message routing can regress without being caught.
- Reproduction path:
  Search CI and package scripts for Playwright/Puppeteer/unpacked-extension
  loading. There is no Chrome extension runtime smoke test.
- Suggested minimal fix:
  Add a CI smoke that builds a temp extension output, launches Chromium with the
  unpacked extension, verifies service-worker registration, injects content
  scripts on a fixture page, and performs a background/content message
  round-trip.
- Test should be added:
  Yes.

### 13. Generated manifest is built but not asserted

- Severity: medium
- File and line:
  `.github/workflows/pr-test.yml:50`
- Why this is a real bug or risk:
  WXT can emit a build even when content-script matches, permissions,
  `host_permissions`, CSP, web-accessible resources, Firefox overrides, or
  offscreen permission behavior change unexpectedly. There is no manifest
  snapshot or semantic assertion after build.
- Reproduction path:
  Modify `wxt.config.ts` to remove a content script match or permission that is
  not covered by tests. CI still only runs build/test/lint/type-check.
- Suggested minimal fix:
  Add `test:manifest` after build to parse `output/*/manifest.json` and assert
  expected MV3 permissions, host permissions, CSP, WAR matches, content-script
  matches/world/all_frames, and browser-specific offscreen behavior.
- Test should be added:
  Yes.

### 14. Privileged backgroundFetch handler lacks direct tests

- Severity: medium
- File and line:
  `apps/extension/src/entrypoints/background/proxy-fetch.ts:88`
- Why this is a real bug or risk:
  Client wrapper tests verify that callers send `backgroundFetch` messages, but
  the privileged background handler itself is not directly covered. URL,
  method, headers, credential defaults, binary encoding, cache invalidation, and
  cookie-change behavior are high-risk because the handler has broad host
  access.
- Reproduction path:
  Search tests for `proxyFetch` or `entrypoints/background/__tests__/proxy-fetch`.
  Current coverage is mostly wrapper-level.
- Suggested minimal fix:
  Add direct handler tests for URL scheme handling, credentials defaulting,
  header/body forwarding, 401/403 invalidation, mutation invalidation, base64
  response encoding, and auth-cookie cache invalidation.
- Test should be added:
  Yes.

### 15. WXT entrypoint manifest options are mostly untested

- Severity: medium
- File and line:
  `apps/extension/vitest.config.ts:16`
- Why this is a real bug or risk:
  Coverage does not include unimported entrypoint files, and tests generally do
  not import WXT entrypoint indexes. Content-script settings such as `matches`,
  `allFrames`, `world`, `runAt`, and `cssInjectionMode` can drift silently.
- Reproduction path:
  Search for tests importing entrypoint `index.ts`/`index.tsx` files. Most tests
  cover helper modules and components rather than WXT entrypoint definitions.
- Suggested minimal fix:
  Enable coverage includes for `src/entrypoints/**/*.{ts,tsx}` and add tests
  that mock `defineContentScript`/`defineBackground` to assert critical
  entrypoint options.
- Test should be added:
  Yes.

## Areas Reviewed With No Additional Exploitable Finding

- Manifest source in `wxt.config.ts`: MV3 is configured, Firefox omits
  `offscreen`, and declared permissions broadly match observed API usage. The
  breadth of `*://*/*`, `tabs`, `scripting`, and `webRequest` makes the runtime
  and manifest tests above important.
- Bilingual page translation insertion uses `textContent`, not `innerHTML`.
- Selection and custom-action visible text paths reviewed in this pass render
  through React text nodes.
- Subtitle UI rendering reviewed in this pass renders text through React.
- YouTube page/world bridge uses same-origin and request-id checks.
- `MarkdownRenderer` is currently unused; react-markdown is safe by default in
  this usage, but any future `rehypeRaw` or custom URL transform should be
  security-reviewed.
