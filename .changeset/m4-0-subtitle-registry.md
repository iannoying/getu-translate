---
"@getu/extension": patch
---

refactor(subtitles): extract PlatformRegistry for multi-platform dispatch

Zero-behavior-change refactor that introduces a `PlatformRegistry` in the
subtitles content script. YouTube is now registered as one platform handler
instead of being hardcoded into `runtime.ts`. Subsequent PRs (M4.1 Bilibili,
M4.2 TED, M4.3 X) will each register their own handler — no further runtime
changes needed.
