---
"@getu/extension": patch
---

feat: M3 PR#C — Pro export + Free watermark + options completion

- Pro: "Download bilingual PDF" button → `pdf-lib` rewrites original PDF
  with translated paragraph annotations; Noto Sans CJK SC subset lazy-loaded
  (file is a documented manual drop-in; README in `public/assets/fonts/`)
- Free: viewer watermark "Translated by GetU — Upgrade to remove"; click
  opens `UpgradeDialog` with `source="pdf-translation-watermark"`
- `showPdfUpgradeDialogAtom` refactored to `{open, source}` for attribution
- Options → PDF Translation: today's usage badge + cache size + clear-cache
- Full i18n across 8 locales (English real text; others English + TODO)
- New `pdf_translate_export` entitlement feature key
- B3 follow-ups: `retroEnqueueRef` respects `quotaExhaustedRef` (pure
  `runRetroEnqueue` helper with unit tests); `evictStaleConfigRows` sweeps
  orphaned cache rows on config change (target-lang / provider switch)
