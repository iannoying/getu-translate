<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# content-script

## Purpose

Content-script-side wrappers around services that must run in the background context: the proxy-fetch client (so requests bypass host-page CORS), the asset-blob resolver (so images can be inlined into shadow-DOM UIs without leaking referrer/credentials), and the long-stream port helpers (so AI text-stream and structured-object responses can flow back from the background over a `runtime.connect` port without hitting the messaging-payload-size cap).

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background-fetch-client.ts`  | `backgroundFetch(input, init?, options?)` — extracts URL/method/headers/body from a `RequestInfo`, builds a `ProxyRequest` (with optional `cacheConfig`/`credentials`/`responseType`), calls `sendMessage("backgroundFetch", …)`, then re-materializes a real `Response` via `proxyResponseToResponse` (handles `bodyEncoding === "base64"` by decoding to `Uint8Array`). |
| `background-asset-url.ts`     | `shouldProxyAssetUrl(url, pageUrl?)` (only proxies HTTP(S) when the page itself is not an extension page) and `resolveContentScriptAssetBlob(url)` — proxy-fetch the asset as `responseType: "base64"`, cache the resolved `Blob` per-URL, dedup concurrent requests via a pending-promise map, with `clearResolvedContentScriptAssetBlobs()` for resets.                 |
| `background-stream-client.ts` | `streamBackgroundText` and `streamBackgroundStructuredObject` — thin typed adapters around `createPortStreamPromise`, picking the right `BACKGROUND_STREAM_PORTS.*` name and `BackgroundStreamResponseMap` type.                                                                                                                                                          |
| `port-streaming.ts`           | `createPortStreamPromise(portName, payload, { signal?, onChunk?, keepAliveIntervalMs? = 20s })` — opens a `browser.runtime.connect`, listens for `chunk`/`done`/`error` messages keyed by a `requestId`, sends a `start` message, pings every 20 s to keep the SW alive, cleans up on settle/disconnect/abort.                                                            |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **Use `backgroundFetch` from any content script that touches the network.** Direct `fetch()` from a content script is subject to the host page's CSP and gets blocked on many sites.
- **`backgroundFetch` always uses the JSON-friendly `responseType: "text"` by default**; pass `responseType: "base64"` when you need binary (`background-asset-url.ts` does this for image blobs).
- **Always pass `signal` to streaming helpers if the caller can cancel.** `createPortStreamPromise` immediately disconnects the port and rejects with `AbortError` on `signal.aborted` — keeps SW + content-script connections clean during fast user actions.
- **Keep-alive ping (`keepAliveIntervalMs`) defaults to 20 s.** This is below the SW idle-timeout window. If a stream sometimes drops with "Stream disconnected unexpectedly", the SW likely went idle — investigate ping cadence rather than retrying blindly.
- **Asset-URL caching is per-page**. `resolvedAssetBlobCache` and `pendingAssetBlobCache` are module-level Maps; call `clearResolvedContentScriptAssetBlobs()` on SPA navigation if you want the next page to refetch.
- The proxy fetch normalizes headers via `getRequestHeaders` (omits when empty) so the background's `headers` array never contains noise — preserve this when extending.

### Testing Requirements

- Tests live in `content-script/__tests__/`. When testing port streaming, mock `browser.runtime.connect` returning a fake port with `onMessage`/`onDisconnect` event APIs.

### Common Patterns

- **Promise + cleanup-on-settle.** `createPortStreamPromise`'s `finalize` pattern (single `settled` flag, `cleanup()` removes every listener / clears keep-alive) is the template for any other "long-lived async with possible abort" helper here.
- **Request-ID-scoped messages.** Every chunk/done/error carries `requestId` so multiple in-flight streams over the same port name don't cross-talk.

## Dependencies

### Internal

- `@/types/proxy-fetch` — `ProxyRequest`, `ProxyResponse`.
- `@/types/background-stream` — `BACKGROUND_STREAM_PORTS`, response/payload maps, port message types.
- `@/utils/message` — `sendMessage`.
- `@/utils/crypto-polyfill` — `getRandomUUID` for request IDs.

### External

- `#imports` (WXT) — `browser`.

<!-- MANUAL: -->
