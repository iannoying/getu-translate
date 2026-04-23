<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-22 (M3 PR #B2) -->

# pdf-viewer

## Purpose

Standalone WXT HTML entrypoint that renders a PDF inside the extension itself. The page reads a `?src=<url>` query parameter and hands it to `pdfjs-dist`'s `PDFViewer`, so the rest of the extension can redirect user navigations to PDF URLs into `chrome-extension://<id>/pdf-viewer.html?src=<url>` and keep the document inside an origin the extension fully controls.

PR #B1 added the translation-overlay scaffolding: on every `textlayerrendered` event we run a pure BabelDOC-inspired paragraph detector over the page's `TextItem[]` and mount a per-page React root that positions `[...]` placeholder slots beneath each detected paragraph. Push-down layout reserves vertical space below the page so the real translation blocks have somewhere to live.

PR #B2 wires the actual translation pipeline: a `TranslationScheduler` (concurrency 6, abort, dedup) enqueues each detected paragraph through `translate-segment.ts` (thin wrapper over `translateTextForPage`) and writes results into `segmentStatusAtomFamily`. `<OverlayLayer>`'s slots subscribe to that atom family via `useAtomValue` and progressively replace the `[...]` placeholder with the translation as each paragraph resolves. Activation is gated by a module-level enqueue policy — `"always"` translates on sight, `"ask"` waits for the first-use toast's Accept, `"manual"` stays idle. PR #B3 will add the file-hash cache, daily quota, and `useProGuard` upgrade path.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`             | WXT entrypoint HTML. Mounts `#viewer-container > #viewer.pdfViewer` and loads `./main.ts` as a module.                                                                                                                                                                                                                                                           |
| `main.ts`                | Configures `pdfjsLib.GlobalWorkerOptions.workerSrc` via `new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url)` and runs `boot()` (reads `?src` through `parseSrcParam`, builds an `EventBus`/`PDFLinkService`/`PDFViewer`, calls `pdfjsLib.getDocument({ url, withCredentials: true })`). Shows "Missing ?src= parameter" when the query param is absent. |
| `parse-src-param.ts`     | Pure helper that extracts the `src` query parameter from a `location.search` string. Lives in its own module so unit tests can import it without pulling `pdfjs-dist/web/pdf_viewer.mjs` (which references `window` at module top level).                                                                                                                        |
| `style.css`              | Page-level styling (viewer container sizing + background). Complements `pdfjs-dist/web/pdf_viewer.css` which `main.ts` imports directly.                                                                                                                                                                                                                         |
| `__tests__/main.test.ts` | Vitest unit tests for `parseSrcParam` — verifies URL decoding, missing param, and empty-value behaviour.                                                                                                                                                                                                                                                         |

## Subdirectories

| Directory      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/`   | Vitest specs for the pure helpers in `main.ts` (e.g. `parseSrcParam`).                                                                                                                                                                                                                                                                                                                                                                  |
| `paragraph/`   | Pure-TS, BabelDOC-inspired paragraph detection (B1). `types.ts` declares `TextItem` / `Paragraph` / `BoundingBox` independently of `pdfjs-dist`; `aggregate.ts` groups a page's `TextItem[]` into reading-order `Paragraph[]` via font + line-spacing + x-alignment heuristics. `__tests__/fixtures/` captures real-PDF dumps. See `BABELDOC_PORT_NOTES.md`.                                                                            |
| `overlay/`     | React overlay layer mounted as a sibling of each page's `.textLayer` (B1). `layer.tsx` (`<OverlayLayer/>`) + `slot.tsx` (`<Slot/>`) render one slot per paragraph; `position-sync.ts` projects PDF-unit bounding boxes to CSS px via the active `PDFPageView.viewport.transform`; `push-down-layout.ts` reserves page-container padding; `segment-content.tsx` is the atom subscriber that swaps the `[...]` placeholder for live text. |
| `translation/` | Translation pipeline (B2). `atoms.ts` exposes `segmentStatusAtomFamily` (keyed by `${fileHash}:${paragraph.key}`); `scheduler.ts` runs the bounded-concurrency promise pool with abort + dedup; `translate-segment.ts` wraps `translateTextForPage` for the scheduler's injection point; `enqueue-policy.ts` is the pure `decideInitialPolicy(activationMode)` helper that gates on-sight vs. toast-gated enqueueing.                   |
| `components/`  | React chrome (PR #A + B2). `first-use-toast.tsx` renders the Accept / Not this time / Never on this site prompt shown under `activationMode === "ask"`; `main.ts` wires its `onAccept` handler in B2 to flip the enqueue policy to `"enabled"` and retroactively schedule every already-rendered page.                                                                                                                                  |

## For AI Agents

### Working In This Directory

- Keep `parseSrcParam` in its own `parse-src-param.ts` module so tests never import `main.ts` (which eagerly loads `pdfjs-dist/web/pdf_viewer.mjs`, and that module throws `ReferenceError: window is not defined` under the Vitest `node` environment). Add new pure helpers to sibling modules rather than inlining them in `main.ts`.
- The worker URL uses Vite's `new URL("…", import.meta.url)` pattern — do not switch to `browser.runtime.getURL` unless the Vite-emitted URL stops resolving inside the extension bundle.
- `pdf-viewer.html` must stay listed in `web_accessible_resources` inside `apps/extension/wxt.config.ts`. Any later redirect interceptor that points at this entrypoint depends on it being web-accessible from `*://*/*` and `file:///*`.
- Keep `paragraph/aggregate.ts` a pure function of the item stream — no DOM, no `pdfjs-dist` runtime imports. Coordinate projection (PDF units → CSS px) stays in `overlay/position-sync.ts` so re-aggregation isn't required on every zoom.
- Each pdf.js page gets one React root in `main.ts`'s `overlayRoots` map, keyed by 1-based page number. Re-invoke `root.render(...)` on every `textlayerrendered` event with a fresh `viewport` prop rather than unmount/remount — pdf.js fires this on every zoom + re-layout.
- **Translation-to-slot wiring:** translations land in `<Slot>` via the `renderSlotContent` callback on `<OverlayLayer>`, which returns a `<SegmentContent segmentKey={...} />` that reads `segmentStatusAtomFamily(key)` through `useAtomValue`. Consumers don't mutate DOM; they set status atoms (usually via `TranslationScheduler`) and React re-renders. Segment keys are `${fileHash}:${paragraph.key}` so atoms across different PDFs stay isolated.
- **Module-level refs in `main.ts`:** a small set of exported refs (`schedulerRef`, `enqueuePolicyRef`, `knownParagraphsRef`) plus a private `retroEnqueueRef` carry per-file state that has to survive across React roots and the toast callback. They're re-seeded at the top of each `renderPdf` call; the module itself is not reinstantiated between files, so any new per-file state you add has to be cleared there too, not at module init.
- **Push-down layout:** `overlay/push-down-layout.ts` exports `computePageExtension(paragraphs, minSlotHeight)` and `DEFAULT_MIN_SLOT_HEIGHT_PX`. `main.ts` applies the result as `pageContainer.style.paddingBottom` after each overlay render. B1/B2 use a simple `paragraphCount * minSlotHeight` linear model; future work can refine with per-slot measured heights as real translation text stabilises in each slot.

### Testing Requirements

Run `SKIP_FREE_API=true pnpm --filter @getu/extension test -- pdf-viewer`. The suite covers: `parseSrcParam` URL handling, `paragraph/aggregate` against realistic `TextItem[]` fixtures (simple paragraph, multi-paragraph vertical gap, heading vs. body, double-column, hyphenated line continuation), `overlay/layer` RTL smoke (slot count, absolute positioning, placeholder text, data attributes, y-flip projection), `overlay/position-sync` matrix math, and `overlay/push-down-layout` linear-model unit tests. End-to-end PDF rendering is still verified manually by loading the built extension and visiting `chrome-extension://<id>/pdf-viewer.html?src=<pdf url>`.

### Common Patterns

- HTML entrypoint follows the same shape as `popup/index.html` / `options/index.html`: single root element and a `<script type="module" src="./main.ts">` (or `main.tsx`) tag.
- CSS is imported directly from `main.ts` rather than linked from `index.html` so Vite bundles it.

## Dependencies

### Internal

- `@/utils/config/storage` + `@/utils/constants/config` (first-use-toast activation decision, initial enqueue-policy seed)
- `@/utils/atoms/pdf-translation` — `addDomainToBlocklistAtom` for the toast's "Never on this site" action (write goes through the shared Jotai store, not storageAdapter directly)
- `@/types/config/config` — `PdfTranslationConfig["activationMode"]` type feeds `decideInitialPolicy`
- `@/utils/pdf/domain` (hostname extraction for blocklist matching)
- `@/utils/pdf/fingerprint` — `fingerprintForPdf` fetches PDF bytes and returns a SHA-256 hex (falls back to a sync URL hash on fetch failure). Keys segment atoms and the Dexie `pdfTranslations` cache rows.
- `@/utils/host/translate/translate-variants` — `translateTextForPage` is the translation primitive wrapped by `translation/translate-segment.ts` and injected into `TranslationScheduler`
- `./components/first-use-toast` (toast UI — PR #A; `onAccept` wired to scheduler in B2)
- `./paragraph/*`, `./overlay/*`, `./translation/*` (see Subdirectories)

### External

- `pdfjs-dist` (`pdfjsLib.getDocument`, `GlobalWorkerOptions`) and `pdfjs-dist/web/pdf_viewer.mjs` (`EventBus`, `PDFLinkService`, `PDFViewer`) plus `pdfjs-dist/web/pdf_viewer.css`.
- `react` + `react-dom/client` (per-page overlay roots, lazy-loaded inside `mountOverlayForPage` to keep the blocklisted / unsupported-URL path off the React bundle).
- `jotai` — `createStore` at module scope for `pdfViewerStore`, `Provider` wrapping every overlay + toast root so atom writes cross React roots. Also lazy-loaded inside `mountOverlayForPage`.

## Browser Compatibility

- **Chrome MV3**: fully supported (primary target). `pnpm exec wxt build` produces `output/chrome-mv3/` with service-worker background and `pdf-viewer.html` in `web_accessible_resources` for `*://*/*` + `file:///*`.
- **Firefox MV3**: filesystem-level build smoke test in M3 PR #A Task 7 passes — `pnpm exec wxt build -b firefox` exits 0 and emits `output/firefox-mv3/pdf-viewer.html`, `manifest.json`, `background.js`, and the bundled `pdf.worker-*.mjs`. No Firefox-specific warnings from pdf-viewer, pdf-redirect, or `pdfjs-dist`. Runtime verification in Firefox (actually opening the viewer on a PDF URL) is deferred — Task 7 is build-only.
- **Known differences**:
  - Firefox MV3 background is an event page (`background.scripts` with `"type": "module"`) while Chrome uses a service worker. WXT handles the switch automatically; the pdf-redirect interceptor (Task 3) should keep working because `webNavigation` + `tabs.update` are available in both.
  - Firefox requires `browser_specific_settings.gecko.id` (auto-injected by WXT) and `strict_min_version: 112.0` to support MV3.
  - Firefox ships its own native `pdf.js` viewer and may not trigger the `.pdf` webNavigation interceptor when the URL is opened directly in the address bar (only when clicked from a page). This was not verified in-browser during Task 7 — flag any user reports as a follow-up for PR #B integration testing.

<!-- MANUAL: -->
