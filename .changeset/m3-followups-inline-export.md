---
"@getu/extension": patch
---

feat(pdf-viewer): inline bilingual PDF export

Pro-tier exported PDFs now place each translation **directly below its
source paragraph** using captured bounding-box coordinates, replacing the
earlier footer-only layout. Result: reading flow matches a native bilingual
document instead of cross-referencing a footnotes block.

- `PdfTranslationParagraph` schema gained optional `boundingBox`
  (Dexie schema v8 → v9; no data loss, legacy rows untouched)
- `PageCacheCoordinator` captures `boundingBox` when writing cache
- `pdf-lib-writer` prefers inline layout per page; legacy cache rows
  without bbox fall back to footer
- Users who want inline output for previously-cached PDFs: Options →
  "Clear cache" then re-translate
