---
"@getu/extension": patch
---

chore: M3 follow-ups — memory cleanup + font subset + scheduler back-off

Three non-blocking improvements from M3 B2/B3/C merge-gate review:

- **Memory cleanup** — bounded LRU (50 pages) on the pdf-viewer's per-page
  overlay/coordinator/pending-seq/known-paragraphs state; prevents heap
  growth on 500+ page PDFs. Cache re-hydrates from Dexie on re-visit
- **CJK font subset** — `noto-sans-cjk-sc-subset.otf` shrunk from ~5 MB
  to ~815 KB by limiting to GB 2312 Level 1 (3755 most-common Mandarin
  chars, ~99.9% corpus coverage) instead of all 20K+ CJK Unified glyphs;
  drops extension bundle from ~20 MB to ~15.8 MB
- **Scheduler retry** — `TranslationScheduler` now retries with exponential
  back-off (1s/2s/4s, 3 attempts max) on 429/503/network/timeout/fetch
  errors; non-retriable errors still fail-fast. Respects AbortSignal.
  Stability win under free-tier provider rate limits
