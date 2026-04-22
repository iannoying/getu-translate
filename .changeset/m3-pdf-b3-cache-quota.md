---
"@getu/extension": patch
---

feat: M3 PR#B3 — PDF translation cache + quota + UpgradeDialog

- `pdfTranslations` Dexie table — per-(fileHash, pageIndex, targetLang, providerId) cache row, 30-day LRU eviction
- `pdfTranslationUsage` daily counter — mirrors M2 input-translation-usage pattern
- `usePdfTranslationQuota` hook enforcing Free 50 pages/day (Q2 count-on-success)
- `PageCacheCoordinator` — cache-first lookup; full-page cache write on success
- Hard-stop on 50th fresh page success: `scheduler.abort()` + `UpgradeDialog` pops; already-translated pages remain visible
- Pro users with `pdf_translate_unlimited` bypass the limit entirely
- Content-based file fingerprint (async SHA-256 of PDF bytes), falls back to URL hash on fetch failure
- Daily cache eviction via `browser.alarms` (30-day TTL)
- New `pdf_translate_unlimited` entitlement feature key registered in contract + extension schemas
