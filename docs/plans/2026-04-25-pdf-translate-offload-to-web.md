# PDF Translate — Offload to Web

**Date**: 2026-04-25
**Status**: Phase 1 + Phase 2 shipped. Phase 3 (Dexie table drop) deferred indefinitely per owner decision (2026-04-25) — orphan tables are accepted to preserve user-cached translations.

## Problem

The extension hosts a full PDF translation stack (self-hosted pdf.js viewer +
navigation hijack + quota + DB cache + dedicated options page). The owner wants
to retire that and instead push users to translate PDFs at
`https://getutranslate.com/document/`.

The first naive idea — "float a 'translate?' chip on the PDF page" — does not
work on Chrome's native PDF viewer (content scripts can't reliably mount on
`application/pdf` documents). User explicitly chose **option C**: surface the
prompt through the toolbar action / popup, **not** via navigation hijack.

## Decision

Approach **C-strict**:

1. **Don't hijack** any PDF navigation — Chrome's native viewer handles it.
2. **Detect PDF tabs passively** in the background and paint a small badge
   (`PDF`) on the toolbar action so users know the extension has something to
   offer.
3. **Popup gets a single button** — *Translate this PDF on the web* — that
   opens `https://getutranslate.com/document/?src=<encoded source URL>` in a
   new tab. The popup button is conditional on the active tab being a PDF.
4. **Rip everything else**: pdf-viewer entrypoint, pdf-redirect listeners,
   utils/pdf, atoms, options page, config slice, locale strings under
   `options.pdfTranslation` and `pdfViewer`.

## Scope

### Phase 1 — wire new behavior (additive)
- `utils/constants/url.ts`: add `WEB_DOCUMENT_TRANSLATE_URL` (resolves to
  `${WEBSITE_URL}/document/`).
- Rewrite `popup/components/translate-current-pdf-button.tsx` to open
  `WEB_DOCUMENT_TRANSLATE_URL?src=<url>` in a new tab. Rename button label
  i18n key to `popup.translatePdfOnWeb`.
- New background module `pdf-detect.ts`: passive PDF detection via
  `tabs.onUpdated` (path-suffix) + `webRequest.onHeadersReceived` (content-type),
  paints `action.setBadgeText({ tabId, text: "PDF" })` and clears on navigation
  away. **Does not** call `tabs.update`.
- Wire `setUpPdfDetect()` from `background/index.ts`.
- i18n: add `popup.translatePdfOnWeb` to all 8 locale files.

### Phase 2 — remove in-extension PDF code (still git-recoverable)
- Delete: `entrypoints/pdf-viewer/`, `entrypoints/background/pdf-redirect.ts`,
  `entrypoints/options/pages/pdf-translation/`, `utils/pdf/`,
  `utils/atoms/pdf-translation.ts`, `utils/db/dexie/pdf-translations.ts`,
  `utils/db/dexie/pdf-translation-usage.ts`,
  `utils/db/dexie/tables/pdf-translations.ts`, all corresponding `__tests__`.
- `wxt.config.ts`: remove `pdf-viewer.html` from `web_accessible_resources`.
- `entrypoints/options/app.tsx`: drop `PdfTranslationPage` lazy import + route.
- `entrypoints/options/app-sidebar/nav-items.ts`: drop `/pdf-translation`.
- `entrypoints/options/app-sidebar/settings-nav.tsx`: drop link block.
- `entrypoints/options/command-palette/search-items.ts`: drop 4 PDF entries.
- `entrypoints/background/index.ts`: drop `setUpPdfRedirect` /
  `setUpPdfContentTypeRedirect` imports + calls.
- `entrypoints/background/db-cleanup.ts`: remove
  `PDF_TRANSLATIONS_EVICTION_ALARM`, `cleanupOldPdfTranslations`,
  `evictExpired` import. Cancel any existing alarm with that name on startup
  so old installs don't keep firing into a void.
- `types/config/config.ts`: drop `pdfTranslationSchema`, drop field from
  `configSchema`, drop `PdfTranslationConfig` export.
- `utils/constants/config.ts`: drop `pdfTranslation` from `DEFAULT_CONFIG`.
- Locales: delete `options.pdfTranslation.*` and `pdfViewer.*` blocks; rename
  `popup.translateCurrentPdf` → `popup.translatePdfOnWeb`.
- New migration `v071-to-v072.ts`: strip `pdfTranslation` from oldConfig. Bump
  `CONFIG_SCHEMA_VERSION` to 72. Test fixture under
  `__tests__/example/v071.ts` already exists; add `v072.ts`.
- Entitlements `FeatureKeySchema`: **leave the three `pdf_translate*` keys
  in place**. Backend may still emit them; removing them would fail
  `EntitlementsSchema.parse()`. They become inert — no consumer in the
  extension reads them after this change.

### Phase 3 — Dexie schema bump (DEFERRED)
- **Decision (2026-04-25):** owner chose to leave the `pdfTranslations` and
  `pdfTranslationUsage` object stores in place on existing user disks rather
  than ship a `version(11)` schema that nulls them out. Outcome:
  - The class properties + `mapToClass` calls were removed in Phase 2, so
    nothing in the source reads or writes those tables.
  - The tables remain declared in `version(10).stores({...})`, so Dexie keeps
    them allocated; existing rows survive untouched.
  - Cost: a few KB to a few MB of orphan IndexedDB data per user, no impact
    on runtime.
  - Revisit only when there is a reason to reclaim space (e.g. quota
    pressure, broader DB rewrite). At that point, add
    `version(N).stores({ ..., pdfTranslations: null, pdfTranslationUsage: null })`.

## Risks

- ~~**Existing Pro users** with cached PDF translations lose them.~~
  No longer applicable: Phase 3 was deferred, so cached translations stay on
  disk (orphaned but readable if anyone ever wires up readers again).
- **Old install with stuck alarm**: handled — db-cleanup will explicitly
  `browser.alarms.clear("pdf-translations-eviction")` once on startup.
- **Backend still serves `pdf_translate*` features**: harmless — schema still
  accepts them, no consumer.
- **Localization regressions**: keys are deleted from all 8 yml files; if any
  yml lacks one key the i18n module just falls back to `en`.

## Success criteria

- Opening a `.pdf` URL renders Chrome's native viewer (no extension redirect).
- Toolbar action shows `PDF` badge on that tab.
- Popup shows *Translate this PDF on the web*; clicking opens
  `getutranslate.com/document/?src=<...>` in a new tab.
- `pnpm typecheck && pnpm test && pnpm build` green.
- No reference to `pdf-viewer`, `pdf-redirect`, `pdfTranslation`, `utils/pdf`
  remains in source.
