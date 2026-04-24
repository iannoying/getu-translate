---
"@getu/extension": patch
---

fix(pdf): auto-redirect PDFs served without `.pdf` suffix (arxiv `/pdf/2507.15551`, CMS handlers) via `Content-Type: application/pdf` sniffing in a new `webRequest.onHeadersReceived` listener; the fast `.pdf`-suffix path is kept as the primary trigger
