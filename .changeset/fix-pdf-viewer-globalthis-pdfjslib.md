---
"@getu/extension": patch
---

fix(pdf-viewer): set `globalThis.pdfjsLib` before importing `pdfjs-dist/web/pdf_viewer.mjs` so the viewer module can destructure `AbortException` and friends; previously the parallel `Promise.all` import could race and throw "Cannot destructure property 'AbortException' of 'globalThis.pdfjsLib' as it is undefined"
