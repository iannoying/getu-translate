<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-19 | Updated: 2026-04-19 -->

# utils

## Purpose

Sidebar-local helper modules used by the side.content entrypoint that don't belong in the global `src/utils/` tree. `article.ts` flattens a host-page DOM subtree into clean text paragraphs (and extracts SEO meta) for the article-reader feature. `downloader.ts` exports an article-explanation result set as a Markdown file via `file-saver`, using the templates and tokens from `@/utils/constants/side`.

## Key Files

| File            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `article.ts`    | `flattenToParagraphs(root)` walks the DOM looking for "block-level leaves" (semantic block tags or `display: block                                                                                                                                                                                                                                                                                                                                                                           | list-item`elements with no block descendants), extracts their text via`getTextWithSpaces`(recursive, inserts inter-inline spaces while skipping spaces after trailing punctuation`[.!?,:;'"…)}\]]`), collapses whitespace, and filters paragraphs > 20 chars. Also exports `extractSeoInfo(doc)`returning title, meta description/keywords, canonical URL, OpenGraph + Twitter cards, all`<h1>`text, and parsed`<script type="application/ld+json">` blocks. |
| `downloader.ts` | Singleton `Downloader` class with a strategy map keyed by file type (`md` only, today). `download(explainDataList, fileType, opts)` dispatches into `downloadMarkdown`, which assembles a single Markdown string from `AST_TEMPLATE` / `SENTENCE_TEMPLATE` / `WORDS_TEMPLATE`, replaces `MARKDOWN_TEMPLATE_TOKEN` placeholders (title, sentences, words, explanations, indices), and saves via `file-saver`'s `saveAs(blob, '${title}.md')`. Surfaces failures via `sonner`'s `toast.error`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- `flattenToParagraphs` is **not a translation walker** — it is read-only and intentionally separate from `src/utils/host/dom/traversal`. Do not unify them; the article-reader needs raw flat text, not the bilingual paragraph-labelling pipeline.
- The 20-char minimum paragraph length is a deliberate noise filter for nav/UI fragments. Adjust only with a measured impact on representative pages.
- `getTextWithSpaces` decides whether to insert a separating space by inspecting the **next** child's start (via `TRAILING_PUNCTUATION_RE`) — this is the right hook to extend if you need to support a new punctuation system (CJK, etc.).
- `Downloader` is exported as a `new Downloader()` singleton. The `title = document.title ?? "Untitled"` field is captured **at module-load time** of the side content script — if the host page mutates `document.title` later you will export a stale title. If that matters, refactor to read `document.title` inside `downloadMarkdown` instead.
- New file-type exporters are added by extending the `downloader: DOWNLOADER_MAP` map and the `DOWNLOAD_FILE_ITEMS` const in `@/utils/constants/side`. Keep the strategy signature `(explainDataList, opts?) => void` consistent.
- Do not log structured-data parse errors to `console.error` in new code — wire through `@/utils/logger` instead. The existing `console.error` in `extractSeoInfo` predates the convention and is a candidate for cleanup.

### Testing Requirements

Vitest with co-located `__tests__/`. None today; add tests under `utils/__tests__/<file>.test.ts`. For `article.ts`, build DOM fixtures via `document.implementation.createHTMLDocument` (jsdom/happy-dom) and assert paragraph counts/contents and that nested block elements are _not_ double-counted. For `downloader.ts`, mock `file-saver`'s `saveAs` and `sonner`'s `toast`, then assert the Markdown string matches the expected template substitution.

### Common Patterns

- Block-leaf detection: explicit semantic-tag set + `getComputedStyle` fallback. Cheap and robust.
- Top-of-module compiled regex constants (`TRAILING_PUNCTUATION_RE`, `WHITESPACE_RUN_RE`) avoid per-call recompilation.
- Strategy-map dispatch in `Downloader` keeps adding formats (e.g. `txt`, `json`, `epub`) a one-line registration plus an instance method.
- Template-driven assembly via `MARKDOWN_TEMPLATE_TOKEN` keeps copy/i18n changes out of code.

## Dependencies

### Internal

- `@/types/content` — `ArticleExplanation`, `ArticleWord`.
- `@/utils/constants/side` — `AST_TEMPLATE`, `SENTENCE_TEMPLATE`, `WORDS_TEMPLATE`, `MARKDOWN_TEMPLATE_TOKEN`, `PARAGRAPH_DEPTH`, `DOWNLOAD_FILE_ITEMS`.

### External

- `file-saver` — browser file download via `saveAs(blob, filename)`.
- `sonner` — `toast.error` user-facing failure surface.

<!-- MANUAL: -->
