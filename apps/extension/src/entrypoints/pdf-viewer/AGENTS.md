<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-22 (M3 PR #B1) -->

# pdf-viewer

## Purpose

Standalone WXT HTML entrypoint that renders a PDF inside the extension itself. The page reads a `?src=<url>` query parameter and hands it to `pdfjs-dist`'s `PDFViewer`, so the rest of the extension can redirect user navigations to PDF URLs into `chrome-extension://<id>/pdf-viewer.html?src=<url>` and keep the document inside an origin the extension fully controls.

PR #B1 added the translation-overlay scaffolding: on every `textlayerrendered` event we run a pure BabelDOC-inspired paragraph detector over the page's `TextItem[]` and mount a per-page React root that positions `[...]` placeholder slots beneath each detected paragraph. Push-down layout reserves vertical space below the page so the real translation blocks have somewhere to live. Actual translation rendering (providers, scheduler, caching) is wired in PR #B2 — this entrypoint currently paints placeholders only.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`             | WXT entrypoint HTML. Mounts `#viewer-container > #viewer.pdfViewer` and loads `./main.ts` as a module.                                                                                                                                                                                                                                                           |
| `main.ts`                | Configures `pdfjsLib.GlobalWorkerOptions.workerSrc` via `new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url)` and runs `boot()` (reads `?src` through `parseSrcParam`, builds an `EventBus`/`PDFLinkService`/`PDFViewer`, calls `pdfjsLib.getDocument({ url, withCredentials: true })`). Shows "Missing ?src= parameter" when the query param is absent. |
| `parse-src-param.ts`     | Pure helper that extracts the `src` query parameter from a `location.search` string. Lives in its own module so unit tests can import it without pulling `pdfjs-dist/web/pdf_viewer.mjs` (which references `window` at module top level).                                                                                                                        |
| `style.css`              | Page-level styling (viewer container sizing + background). Complements `pdfjs-dist/web/pdf_viewer.css` which `main.ts` imports directly.                                                                                                                                                                                                                         |
| `__tests__/main.test.ts` | Vitest unit tests for `parseSrcParam` — verifies URL decoding, missing param, and empty-value behaviour.                                                                                                                                                                                                                                                         |

## Subdirectories

| Directory    | Purpose                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/` | Vitest specs for the pure helpers in `main.ts` (e.g. `parseSrcParam`).                                                                                                                                                                                                                                                                                  |
| `paragraph/` | Pure-TS, BabelDOC-inspired paragraph detection. `types.ts` declares `TextItem` / `Paragraph` / `BoundingBox` independently of `pdfjs-dist`; `aggregate.ts` groups a page's `TextItem[]` into reading-order `Paragraph[]` via font + line-spacing + x-alignment heuristics. `__tests__/fixtures/` captures real-PDF dumps. See `BABELDOC_PORT_NOTES.md`. |
| `overlay/`   | React overlay layer mounted as a sibling of each page's `.textLayer`. `layer.tsx` (`<OverlayLayer/>`) + `slot.tsx` (`<Slot/>`) render one `[...]` placeholder per paragraph; `position-sync.ts` projects PDF-unit bounding boxes to CSS px via the active `PDFPageView.viewport.transform`; `push-down-layout.ts` reserves page-container padding.      |

## For AI Agents

### Working In This Directory

- Keep `parseSrcParam` in its own `parse-src-param.ts` module so tests never import `main.ts` (which eagerly loads `pdfjs-dist/web/pdf_viewer.mjs`, and that module throws `ReferenceError: window is not defined` under the Vitest `node` environment). Add new pure helpers to sibling modules rather than inlining them in `main.ts`.
- The worker URL uses Vite's `new URL("…", import.meta.url)` pattern — do not switch to `browser.runtime.getURL` unless the Vite-emitted URL stops resolving inside the extension bundle.
- `pdf-viewer.html` must stay listed in `web_accessible_resources` inside `apps/extension/wxt.config.ts`. Any later redirect interceptor that points at this entrypoint depends on it being web-accessible from `*://*/*` and `file:///*`.
- Keep `paragraph/aggregate.ts` a pure function of the item stream — no DOM, no `pdfjs-dist` runtime imports. Coordinate projection (PDF units → CSS px) stays in `overlay/position-sync.ts` so re-aggregation isn't required on every zoom.
- Each pdf.js page gets one React root in `main.ts`'s `overlayRoots` map, keyed by 1-based page number. Re-invoke `root.render(...)` on every `textlayerrendered` event with a fresh `viewport` prop rather than unmount/remount — pdf.js fires this on every zoom + re-layout.
- **PR #B2 integration hook:** translation text should be injected into the DOM by targeting the `data-segment-key` attribute on `.getu-slot` divs (matches each `Paragraph.key`, format `p-${pageIndex}-${paragraphIndex}`). Prefer driving slot content through props on `<OverlayLayer/>` (e.g. a `translations: Map<key, string>` or Jotai atom) over mutating the DOM directly, so React stays the single source of truth for slot contents.
- **Push-down layout:** `overlay/push-down-layout.ts` exports `computePageExtension(paragraphs, minSlotHeight)` and `DEFAULT_MIN_SLOT_HEIGHT_PX`. `main.ts` applies the result as `pageContainer.style.paddingBottom` after each overlay render. B1 uses a simple `paragraphCount * minSlotHeight` linear model; B2 will refine with per-slot measured heights once real translation text lands.

### Testing Requirements

Run `SKIP_FREE_API=true pnpm --filter @getu/extension test -- pdf-viewer`. The suite covers: `parseSrcParam` URL handling, `paragraph/aggregate` against realistic `TextItem[]` fixtures (simple paragraph, multi-paragraph vertical gap, heading vs. body, double-column, hyphenated line continuation), `overlay/layer` RTL smoke (slot count, absolute positioning, placeholder text, data attributes, y-flip projection), `overlay/position-sync` matrix math, and `overlay/push-down-layout` linear-model unit tests. End-to-end PDF rendering is still verified manually by loading the built extension and visiting `chrome-extension://<id>/pdf-viewer.html?src=<pdf url>`.

### Common Patterns

- HTML entrypoint follows the same shape as `popup/index.html` / `options/index.html`: single root element and a `<script type="module" src="./main.ts">` (or `main.tsx`) tag.
- CSS is imported directly from `main.ts` rather than linked from `index.html` so Vite bundles it.

## Dependencies

### Internal

- `@/utils/config/storage` + `@/utils/constants/config` (first-use-toast activation decision)
- `@/utils/atoms/storage-adapter` + `@/types/config/config` (blocklist write in "Never on this site")
- `@/utils/pdf/domain` (hostname extraction for blocklist matching)
- `./components/first-use-toast` (toast UI — M3 PR #A)
- `./paragraph/*`, `./overlay/*` (B1 paragraph detection + overlay; see Subdirectories)
- PR #B2 will additionally pull translation atoms / providers from `@/utils/*`.

### External

- `pdfjs-dist` (`pdfjsLib.getDocument`, `GlobalWorkerOptions`) and `pdfjs-dist/web/pdf_viewer.mjs` (`EventBus`, `PDFLinkService`, `PDFViewer`) plus `pdfjs-dist/web/pdf_viewer.css`.
- `react` + `react-dom/client` (per-page overlay roots, lazy-loaded inside `mountOverlayForPage` to keep the blocklisted / unsupported-URL path off the React bundle).

## Browser Compatibility

- **Chrome MV3**: fully supported (primary target). `pnpm exec wxt build` produces `.output/chrome-mv3/` with service-worker background and `pdf-viewer.html` in `web_accessible_resources` for `*://*/*` + `file:///*`.
- **Firefox MV3**: filesystem-level build smoke test in M3 PR #A Task 7 passes — `pnpm exec wxt build -b firefox` exits 0 and emits `.output/firefox-mv3/pdf-viewer.html`, `manifest.json`, `background.js`, and the bundled `pdf.worker-*.mjs`. No Firefox-specific warnings from pdf-viewer, pdf-redirect, or `pdfjs-dist`. Runtime verification in Firefox (actually opening the viewer on a PDF URL) is deferred — Task 7 is build-only.
- **Known differences**:
  - Firefox MV3 background is an event page (`background.scripts` with `"type": "module"`) while Chrome uses a service worker. WXT handles the switch automatically; the pdf-redirect interceptor (Task 3) should keep working because `webNavigation` + `tabs.update` are available in both.
  - Firefox requires `browser_specific_settings.gecko.id` (auto-injected by WXT) and `strict_min_version: 112.0` to support MV3.
  - Firefox ships its own native `pdf.js` viewer and may not trigger the `.pdf` webNavigation interceptor when the URL is opened directly in the address bar (only when clicked from a page). This was not verified in-browser during Task 7 — flag any user reports as a follow-up for PR #B integration testing.

<!-- MANUAL: -->
