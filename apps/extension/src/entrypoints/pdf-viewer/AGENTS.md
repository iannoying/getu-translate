<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-21 | Updated: 2026-04-21 (Task 7) -->

# pdf-viewer

## Purpose

Standalone WXT HTML entrypoint that renders a PDF inside the extension itself. The page reads a `?src=<url>` query parameter and hands it to `pdfjs-dist`'s `PDFViewer`, so the rest of the extension can redirect user navigations to PDF URLs into `chrome-extension://<id>/pdf-viewer.html?src=<url>` and keep the document inside an origin the extension fully controls. At this stage the viewer is bare — it only loads and renders the PDF. Translation, the first-use toast, and redirect interception are added in later M3 tasks.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`             | WXT entrypoint HTML. Mounts `#viewer-container > #viewer.pdfViewer` and loads `./main.ts` as a module.                                                                                                                                                                                                                                                           |
| `main.ts`                | Configures `pdfjsLib.GlobalWorkerOptions.workerSrc` via `new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url)` and runs `boot()` (reads `?src` through `parseSrcParam`, builds an `EventBus`/`PDFLinkService`/`PDFViewer`, calls `pdfjsLib.getDocument({ url, withCredentials: true })`). Shows "Missing ?src= parameter" when the query param is absent. |
| `parse-src-param.ts`     | Pure helper that extracts the `src` query parameter from a `location.search` string. Lives in its own module so unit tests can import it without pulling `pdfjs-dist/web/pdf_viewer.mjs` (which references `window` at module top level).                                                                                                                        |
| `style.css`              | Page-level styling (viewer container sizing + background). Complements `pdfjs-dist/web/pdf_viewer.css` which `main.ts` imports directly.                                                                                                                                                                                                                         |
| `__tests__/main.test.ts` | Vitest unit tests for `parseSrcParam` — verifies URL decoding, missing param, and empty-value behaviour.                                                                                                                                                                                                                                                         |

## Subdirectories

| Directory    | Purpose                                         |
| ------------ | ----------------------------------------------- |
| `__tests__/` | Vitest specs for the pure helpers in `main.ts`. |

## For AI Agents

### Working In This Directory

- Keep `parseSrcParam` in its own `parse-src-param.ts` module so tests never import `main.ts` (which eagerly loads `pdfjs-dist/web/pdf_viewer.mjs`, and that module throws `ReferenceError: window is not defined` under the Vitest `node` environment). Add new pure helpers to sibling modules rather than inlining them in `main.ts`.
- The worker URL uses Vite's `new URL("…", import.meta.url)` pattern — do not switch to `browser.runtime.getURL` unless the Vite-emitted URL stops resolving inside the extension bundle.
- `pdf-viewer.html` must stay listed in `web_accessible_resources` inside `apps/extension/wxt.config.ts`. Any later redirect interceptor that points at this entrypoint depends on it being web-accessible from `*://*/*` and `file:///*`.
- Do not add translation logic here yet — M3 PR #A Task 2 is scaffolding only. Translation hooks land in subsequent tasks alongside config wiring and toast UI.

### Testing Requirements

Run `SKIP_FREE_API=true pnpm --filter @getu/extension test -- pdf-viewer`. The suite currently asserts the query-param parser only; DOM / pdfjs integration is exercised manually by loading the built extension and visiting `chrome-extension://<id>/pdf-viewer.html?src=<pdf url>`.

### Common Patterns

- HTML entrypoint follows the same shape as `popup/index.html` / `options/index.html`: single root element and a `<script type="module" src="./main.ts">` (or `main.tsx`) tag.
- CSS is imported directly from `main.ts` rather than linked from `index.html` so Vite bundles it.

## Dependencies

### Internal

None yet. Later tasks will pull in config atoms, messaging helpers, and translation utilities from `@/utils/*`.

### External

- `pdfjs-dist` (`pdfjsLib.getDocument`, `GlobalWorkerOptions`) and `pdfjs-dist/web/pdf_viewer.mjs` (`EventBus`, `PDFLinkService`, `PDFViewer`) plus `pdfjs-dist/web/pdf_viewer.css`.

## Browser Compatibility

- **Chrome MV3**: fully supported (primary target). `pnpm exec wxt build` produces `.output/chrome-mv3/` with service-worker background and `pdf-viewer.html` in `web_accessible_resources` for `*://*/*` + `file:///*`.
- **Firefox MV3**: filesystem-level build smoke test in M3 PR #A Task 7 passes — `pnpm exec wxt build -b firefox` exits 0 and emits `.output/firefox-mv3/pdf-viewer.html`, `manifest.json`, `background.js`, and the bundled `pdf.worker-*.mjs`. No Firefox-specific warnings from pdf-viewer, pdf-redirect, or `pdfjs-dist`. Runtime verification in Firefox (actually opening the viewer on a PDF URL) is deferred — Task 7 is build-only.
- **Known differences**:
  - Firefox MV3 background is an event page (`background.scripts` with `"type": "module"`) while Chrome uses a service worker. WXT handles the switch automatically; the pdf-redirect interceptor (Task 3) should keep working because `webNavigation` + `tabs.update` are available in both.
  - Firefox requires `browser_specific_settings.gecko.id` (auto-injected by WXT) and `strict_min_version: 112.0` to support MV3.
  - Firefox ships its own native `pdf.js` viewer and may not trigger the `.pdf` webNavigation interceptor when the URL is opened directly in the address bar (only when clicked from a page). This was not verified in-browser during Task 7 — flag any user reports as a follow-up for PR #B integration testing.

<!-- MANUAL: -->
