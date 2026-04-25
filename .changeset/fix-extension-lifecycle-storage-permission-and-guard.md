---
"@getu/extension": patch
---

Cover the third WXT 0.20 storage-guard message (`"You must add the 'storage' permission to your manifest to use 'wxt/storage'"`) emitted post-reload when Chromium nulls `chrome.storage` while leaving `chrome.runtime` in a stale state — the manifest *does* declare `storage`, the message is misleading. Add a defense-in-depth `installContentScriptLifecycleGuard` that registers a per-context `unhandledrejection` listener silently swallowing lifecycle rejections; wire it into all five content scripts (host / side / selection / subtitles / guide) so any future fire-and-forget path that escapes our explicit `.catch(swallow…)` wrappers still gets caught at the boundary. Real failures continue to surface through the shared logger.
