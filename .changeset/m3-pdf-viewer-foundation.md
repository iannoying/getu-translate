---
"@getu/extension": minor
---

feat: M3 PR#A — PDF viewer foundation

- New `pdf-viewer` entrypoint powered by `pdfjs-dist` replaces the browser's default PDF viewer
- Background `.pdf` navigation interception with first-use opt-in toast (Translate / This time / Never)
- Popup "Translate current PDF" manual fallback button for blocked / manual-mode users
- Options "PDF Translation" settings page: global switch, activation mode (always / ask / manual), domain blocklist, `file://` access detection with guidance card
- New `pdfTranslation` config slice + v069→v070 migration
- Chrome + Firefox MV3 compatible (Firefox build verified; runtime compatibility noted in pdf-viewer AGENTS.md)
- No translation rendering yet — PR #B will add segment translation, quota, and double-language overlay
