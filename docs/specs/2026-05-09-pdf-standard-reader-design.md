# PDF Standard Reader Design

Date: 2026-05-09

## Goal

Upgrade the web document translation result page into a screenshot-style PDF reader:

- `/[locale]/document` keeps the current PDF upload, model selection, language selection, auth, quota, and job creation flow.
- Upload success opens `/[locale]/document/preview?jobId=...`.
- The preview page shows the original PDF on the left via PDF.js and translated text on the right, grouped by page.
- The top toolbar lets users change translation service and languages, but a new translation only starts after an explicit retranslate button click.
- The first version is labelled Standard Mode because it does not preserve the translated PDF layout. Layout-preserving PDFMathTranslate output remains a future mode.

## Decisions

1. Use the existing Cloudflare Worker document pipeline for v1.
   - Keep the current R2 upload, D1 `translation_jobs`, Cloudflare Queue, `unpdf` extraction, chunked translation, and HTML/Markdown output.
   - Do not add PDFMathTranslate infrastructure in this phase.

2. Upgrade the existing preview route instead of adding an unrelated result URL.
   - `/[locale]/document/preview?jobId=...` already owns status polling, history, retry, and downloads.
   - The route becomes the full-screen PDF reader once the job is done.

3. Make result-page controls editable, but require button confirmation.
   - Changing model/source/target updates draft state only.
   - Clicking retranslate creates a new job from the original PDF and consumes quota.
   - This avoids accidental quota spend from dropdown mis-clicks.

4. Store each job's outputs under the current job id.
   - Retranslations can reuse the original `source.pdf`, but outputs must not be derived from the original source key.
   - Output keys should use the processing job id so multiple retranslations cannot overwrite each other.

## Architecture

### Current Flow

```text
/document upload
  -> R2 source.pdf
  -> translate.document.create
  -> translation_jobs row
  -> Cloudflare Queue
  -> source.pdf -> unpdf -> chunks -> provider translate
  -> segments.json + output.html + output.md
  -> /document/preview?jobId=...
```

### New Reader Flow

```text
/document/preview?jobId=...
  -> poll translate.document.status
  -> when done: translate.document.preview({ jobId })
  -> returns job metadata + signed source PDF URL + signed segments URL
  -> PDF.js renders source PDF left pane
  -> React renders translated segments right pane, grouped by page
```

### Retranslate Flow

```text
user changes service/language draft state
  -> clicks retranslate
  -> translate.document.retranslate({ jobId, modelId, sourceLang, targetLang })
  -> server verifies ownership and source.pdf availability
  -> inserts new translation_jobs row
  -> consumes PDF quota for new job
  -> enqueues new job
  -> client navigates to /document/preview?jobId={newJobId}
```

## API Design

### `translate.document.preview`

Input:

```ts
{ jobId: string }
```

Output:

```ts
{
  job: {
    id: string
    sourceFilename: string | null
    sourcePages: number
    sourceBytes: number | null
    modelId: string
    sourceLang: string
    targetLang: string
    status: "done"
    engine: "simple" | "babeldoc"
    createdAt: string
    expiresAt: string
  }
  sourcePdfUrl: string
  segmentsJsonUrl: string
  htmlUrl: string | null
  mdUrl: string | null
  expiresAt: string
}
```

Rules:

- Requires auth.
- Rejects non-owner jobs.
- Rejects jobs that are not `done`.
- Signs URLs for one hour, matching the existing download behavior.
- Returns `NOT_FOUND` if required assets are unavailable.

### `translate.document.retranslate`

Input:

```ts
{
  jobId: string
  modelId: string
  sourceLang: string
  targetLang: string
}
```

Output:

```ts
{ jobId: string }
```

Rules:

- Requires auth and job ownership.
- Requires original `source.pdf` to still exist in R2.
- Applies existing model access rules: free users can only use free models.
- Applies existing one-active-PDF-job-per-user rule.
- Consumes `web_pdf_translate_monthly` quota again using the new job id.
- Reuses the source file but writes outputs under the new job id.

### Download URL Handling

Keep `translate.document.downloadUrl` for HTML and Markdown downloads. The reader should use `preview` rather than requesting separate URLs one by one.

Future extension:

- Add a PDF output URL when a layout-preserving engine writes `dual.pdf`.

## Storage Design

Existing source keys stay as-is:

```text
pdfs/{userId}/{uploadJobId}/source.pdf
```

For every translation job, write outputs under the current job id:

```text
pdfs/{userId}/{jobId}/segments.json
pdfs/{userId}/{jobId}/output.html
pdfs/{userId}/{jobId}/output.md
```

Future layout-preserving output:

```text
pdfs/{userId}/{jobId}/dual.pdf
```

Cleanup should delete keys explicitly recorded on the job plus derived per-job output keys. It must not assume every output shares the source prefix, because retranslations may reuse a source from an older job.

## Frontend Components

### `PreviewClient`

Responsibilities:

- Poll job status.
- Render the reader chrome during queued/processing states so the page does not visually jump.
- Load preview URLs when status becomes done.
- Own entitlements and upgrade modal state for retranslate gating.
- Navigate to the new job after successful retranslation.

### `PdfDualReader`

Responsibilities:

- Render the top toolbar, secondary PDF toolbar, optional sidebar, and dual-pane body.
- Keep page, zoom, fit-width, and sidebar state.
- Pass source PDF URL to the PDF.js pane.
- Pass grouped translation segments to the translation pane.
- Display Standard Mode clearly.

### `PdfSourcePane`

Responsibilities:

- Use PDF.js to render pages from the signed source PDF URL.
- Support fit-width and zoom controls.
- Expose current page changes to `PdfDualReader`.
- Use the PDF outline when available.

### `TranslationPane`

Responsibilities:

- Load and parse `segments.json`.
- Group segments by `startPage`.
- Render translated page sections matching the source page order.
- For a multi-page segment, show it under its first page with a small continuation marker.

### `PdfOutlineSidebar`

Responsibilities:

- Show PDF outline from PDF.js when available.
- Fall back to a page list when no outline exists.
- Keep the current page highlighted.

## UI Behavior

Top toolbar:

- Translation service select: editable draft state.
- Source language select: editable draft state.
- Target language select: editable draft state.
- Retranslate button: enabled when draft differs from current job.
- Open new file button: routes to `/document`.
- Download button/menu: HTML and Markdown in v1.
- Layout Mode button: disabled or marked coming soon.
- Standard Mode indicator: visible in the reader.

Secondary toolbar:

- Sidebar toggle.
- Previous/next page.
- Current page and total pages.
- Search control can be shown as disabled, but full translated-text search is not required in v1.
- Zoom out, fit width, zoom in.
- Help/settings buttons should be hidden unless they have a v1 action.

Body:

- Left pane: source PDF page.
- Right pane: translated page text.
- Page-based scroll synchronization is enough for v1.
- Exact source-span to translated-paragraph highlighting is out of scope.

## Error Handling

- `queued` / `processing`: show progress in the reader shell.
- `failed`: show the existing retry affordance.
- Poll timeout: keep existing refresh behavior.
- Preview asset missing: show a recoverable error with retry or open-new-file action.
- PDF.js load failure: show a PDF preview error and keep HTML/MD downloads available if URLs exist.
- Segments JSON parse failure: show translated preview unavailable and keep downloads available.
- Retranslate quota failure: show the existing PDF quota upgrade modal.
- Retranslate Pro-model failure: show the existing Pro model upgrade modal.
- Retranslate conflict: route or link to the active job if the API returns `PDF_JOB_INFLIGHT`.

## Out Of Scope

- Running PDFMathTranslate in production.
- Layout-preserved translated PDF output.
- OCR or scanned PDF support.
- Editable translated text boxes.
- Source-span and translation-span hover synchronization.
- Same-file translation cache reuse across languages or models.
- Full translated-text search.

## Acceptance Criteria

- Uploading a PDF from `/en/document/` opens `/en/document/preview?jobId=...`.
- While processing, the preview page shows progress inside the reader layout.
- When done, the left pane renders the original PDF via PDF.js.
- When done, the right pane renders translated segments grouped by page.
- The toolbar service/language controls are editable draft controls.
- Clicking retranslate creates a new job from the original source PDF and navigates to the new preview job.
- Retranslation consumes quota and respects Pro model gating.
- Multiple retranslations from the same source PDF do not overwrite each other's `segments.json`, `output.html`, or `output.md`.
- History drawer can open prior result jobs.
- HTML and Markdown downloads still work.
- API rejects preview and retranslate attempts for jobs owned by another user.

## Implementation Notes

- The web app is statically exported, so all preview data loading remains client-side through oRPC.
- Use `localeHref(locale, ...)` for all internal navigation.
- Keep `AuthGate` behavior unchanged.
- Add focused tests around API authorization, output key derivation, segment grouping, and retranslate transitions.
- Before implementing PDF.js, verify the package setup for Next.js static export and worker asset loading.
