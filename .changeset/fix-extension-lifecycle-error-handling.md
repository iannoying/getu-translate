---
"@getu/extension": patch
---

Stop surfacing `'wxt/storage' must be loaded in a web extension environment` and `Could not establish connection. Receiving end does not exist.` as uncaught content-script rejections after the extension is reloaded mid-session. Both are the same lifecycle scenario the previous fix targeted, just with different browser/WXT messages, and now flow through a unified `extension-lifecycle` matcher (`isExtensionContextInvalidatedError`, `isMessagingDisconnectError`, `isExtensionLifecycleError`). All fire-and-forget `sendMessage` and storage call sites in atom `onMount`, visibility handlers, content scripts, options pages, popup, and background→tab broadcasts now silently swallow these expected lifecycle errors while still logging real failures.
