/**
 * Thin wrapper over the existing page-translate pipeline for single
 * paragraph-level PDF segments (PR #B2 Task 4).
 *
 * Why `translateTextForPage`?
 * ---------------------------
 * The PDF viewer is structurally a web page, and we want the same free/AI
 * dispatch, skip-language detection, and hash-cache paths that normal page
 * translation already goes through. `translateTextForPage` reads the global
 * `config.language` + `config.providers` state from storage on every call,
 * which is exactly what we want — the scheduler stays stateless and every
 * segment picks up live config changes.
 *
 * `translateTextForPage` transitively imports `webpage-context` /
 * `webpage-summary`, both of which rely on `document.title` / `document.body`
 * read access. The pdf-viewer entrypoint runs in a normal extension tab, so
 * those DOM globals are available; no shimming required.
 *
 * Alternative considered: calling `translateTextCore` directly to bypass
 * `webpage-context`. Rejected for B2 because:
 *   1. We'd have to duplicate config reads (`getLocalConfig`) and skip-lang
 *      logic here, or accept a regression from the page pipeline.
 *   2. `webpage-context` gracefully returns `undefined` for non-AI providers,
 *      and for AI providers the doc is the PDF viewer shell — which is fine
 *      context to share across segments on the same page.
 * Revisit if B3 profiling shows webpage-context overhead matters per-segment.
 */
import { translateTextForPage } from "@/utils/host/translate/translate-variants"

/**
 * Translate one paragraph's text using the shared page-translation pipeline.
 *
 * Throws on provider / network error — the scheduler converts thrown errors
 * into `{ kind: "error" }` status writes. Returns an empty string if the
 * pipeline decided translation should be skipped (target-language match,
 * skip-language list, empty-after-normalise, etc.).
 */
export async function translateSegment(text: string): Promise<string> {
  return translateTextForPage(text)
}
