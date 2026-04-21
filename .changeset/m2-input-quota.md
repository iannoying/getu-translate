---
"@getu/extension": minor
---

feat(input): enforce daily 50-translation quota for free users (M2 PR A)

Free users are now capped at 50 successful input-field translations per local day; over the cap opens the upgrade dialog. Pro users holding the `input_translate_unlimited` feature remain uncapped. Counter is local-timezone `YYYY-MM-DD` and persists in IndexedDB so it survives tab reloads.
