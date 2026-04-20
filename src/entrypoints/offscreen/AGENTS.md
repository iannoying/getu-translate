<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# offscreen

## Purpose

A Chrome-only MV3 offscreen document used solely to play synthesized TTS audio outside the service worker (which cannot use `Audio`/`URL.createObjectURL` reliably) and outside webpage contexts (where strict media CSP would block extension audio). The background creates this document on demand via `chrome.offscreen.createDocument` (justification: `AUDIO_PLAYBACK`); `main.ts` listens for `ttsOffscreenPlay` / `ttsOffscreenStop`, decodes the Base64 audio into a Blob, plays it through a single `HTMLAudioElement`, and resolves the message with `{ ok: true }` on natural end or `{ ok: false, reason }` if interrupted/stopped. The offscreen permission is conditionally added in `wxt.config.ts` for non-Firefox builds — Firefox does not load this entrypoint.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` | Minimal HTML shell — no body content, just `<script type="module" src="./main.ts">`; loaded by Chrome when the background calls `chrome.offscreen.createDocument`.                                                                                                                                                                                                                                                        |
| `main.ts`    | Implements the `ttsOffscreenPlay`/`ttsOffscreenStop` message handlers. Maintains a single `ActivePlayback` (latest-request-wins): `base64ToUint8Array` → `Blob` → `URL.createObjectURL` → `new Audio(url).play()`; `settlePlayback`/`failPlayback` revoke the object URL and reset `audio.src` to free memory; `stopActivePlayback(reason, requestId?)` only cancels when the requestId matches (or when no id is given). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- This entrypoint only ships on Chrome/Edge — `wxt.config.ts` adds the `offscreen` permission only when `browser !== "firefox"`. Don't reference offscreen-only behaviour from cross-browser code without a guard.
- Only one `ActivePlayback` is allowed at a time; new `ttsOffscreenPlay` messages call `stopActivePlayback("interrupted")` first. Preserve this latest-wins semantic — the background's `tts-playback.ts` relies on it.
- Always revoke the object URL in `cleanupPlayback` — the offscreen document can live for many minutes and leaked Blob URLs accumulate.
- Errors must travel back through the message channel (`reject` or `{ ok: false, reason }`); throwing without rejecting will leave the background `sendMessage("ttsOffscreenPlay", ...)` hanging.
- The audio payload arrives Base64-encoded because `runtime.sendMessage` only carries JSON-serializable data — do not try to pass `ArrayBuffer`/`Blob` directly across contexts.
- Document lifecycle is owned by `background/tts-playback.ts` (`ensureOffscreenDocument`); this file should not call `chrome.offscreen.*` itself.

### Testing Requirements

Run `pnpm test` (Vitest). No co-located `__tests__/`; coverage lives with the background TTS layer and `@/utils/server/edge-tts`. Live audio cannot be exercised in jsdom — assertions focus on the background's offscreen orchestration.

### Common Patterns

- Single mutable `activePlayback: ActivePlayback | null` with `settled` guard to avoid double-resolve.
- `onMessage(...)` returns a `Promise` that resolves only after the audio finishes / is stopped — the background `await`s it.
- Cleanup always: `audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(...)`.

## Dependencies

### Internal

- `@/utils/message` — `onMessage` for `ttsOffscreenPlay`/`ttsOffscreenStop`.
- `@/types/tts-playback` — `TTSPlaybackStartResponse`, `TTSPlaybackStopReason`.

### External

- Plain DOM (`HTMLAudioElement`, `Blob`, `URL.createObjectURL`, `atob`). No external npm packages.

<!-- MANUAL: -->
