---
"@getu/extension": patch
---

feat: M3 PR#B1 — paragraph detection + overlay skeleton

- BabelDOC-inspired paragraph detection from pdf.js textLayer (pure TS, fixture-driven tests)
- Independent overlay layer: placeholder `[...]` slots below each paragraph
- Zoom + page navigation preserve overlay alignment (4-corner viewport projection)
- Push-down layout primitive reserves vertical space for upcoming translation blocks
- No translation yet — PR #B2 wires the scheduler
