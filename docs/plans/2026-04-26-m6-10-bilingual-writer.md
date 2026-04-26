# M6.10 — Bilingual HTML/MD Output Writer + State Machine (Outline)

> **For agentic workers:** This is an OUTLINE plan, not yet executable. Before invoking `superpowers:executing-plans`, expand this into a full TDD plan via `superpowers:writing-plans` AFTER M6.9 has merged and the `segments.json` shape is stable.

**Goal:** Read `segments.json` written by M6.9, produce a bilingual HTML (responsive two-column / single-column on mobile) and a Markdown (alternating-paragraph) output, write both to R2, and finalize the job to `status='done'` with `output_html_key` / `output_md_key` populated.

**Issue:** [#177 (M6.10/13)](https://github.com/iannoying/getu-translate/issues/177)

---

## Scope locked here

- Reads from R2: `pdfs/{userId}/{jobId}/segments.json` (M6.9 contract)
- Writes to R2:
  - `pdfs/{userId}/{jobId}/output.html` (with `Content-Type: text/html; charset=utf-8`)
  - `pdfs/{userId}/{jobId}/output.md` (with `Content-Type: text/markdown; charset=utf-8`)
- Updates D1: `status='done'`, `output_html_key`, `output_md_key`, clears `progress` JSON.

## Where the M6.10 hook fires

Two design options — decide during expansion:
1. **Inline at end of M6.9 pipeline (preferred, simpler ops):** add a final step in `processOne` that calls `renderBilingualOutput()` after `segments.json` is written. M6.10 becomes "add the renderer + the final state transition".
2. **Second queue (decoupled):** M6.9 enqueues to a render-queue; M6.10 consumes. More robust to renderer bugs, but doubles ops complexity.

**Default decision:** Option 1. Re-debate only if M6.9 pipeline timing approaches Workers CPU limits.

---

## File structure (PR scope)

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/translate/document-output.ts` | Create | Pure renderers: `renderHtml(segments)`, `renderMarkdown(segments)` |
| `apps/api/src/translate/__tests__/document-output.test.ts` | Create | Snapshot tests for HTML + MD output |
| `apps/api/src/translate/document-output-html.css` | Create (or inline) | Inline-able CSS for the bilingual HTML |
| `apps/api/src/queue/translate-document.ts` | Modify | After `segments.json`, call renderers, write outputs, set status='done' |
| `apps/api/src/queue/__tests__/translate-document.test.ts` | Modify | Extend the happy-path test to assert both outputs written + status='done' |
| `packages/db/drizzle/<NNNN>_<name>.sql` | (potentially) | NO — `output_html_key` / `output_md_key` columns already exist (M6.2) |

---

## Acceptance Criteria (from issue body)

- [ ] 10-page sample PDF renders both outputs without truncation.
- [ ] HTML renders as two-column on desktop ≥768px, stacked single-column on mobile (CSS media query, not JS).
- [ ] Markdown alternates: source paragraph → translated paragraph → blank line → next pair.
- [ ] Document header in both formats: title (first 100 chars of source), source/target lang, model id, generated-at timestamp.
- [ ] HTML has anchors `#page-{n}` derived from `segment.startPage` for in-page nav; jumps work in modern browsers.
- [ ] R2 keys match `translation_jobs.output_html_key` / `output_md_key` exactly after success.
- [ ] `expires_at` already set at create time (M6.8) — no change.

---

## High-Level Tasks (to be expanded)

1. **HTML renderer** — pure function `renderHtml(segments, meta) -> string`. Includes:
   - `<!DOCTYPE html><html lang="..."><head>...</head><body>...</body></html>`
   - Inline `<style>` block (no external CSS — self-contained download)
   - Per-segment: `<section data-page="N" id="page-N"><div class="src">...</div><div class="tgt">...</div></section>`
   - Escape source/translation strings (no innerHTML risk)
2. **Markdown renderer** — pure function `renderMarkdown(segments, meta) -> string`. Header front-matter + alternating paragraphs.
3. **State transition** — extend M6.9's `processOne` final step:
   ```ts
   const html = renderHtml(segments, meta)
   const md = renderMarkdown(segments, meta)
   await bucket.put(htmlKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" }})
   await bucket.put(mdKey, md, { httpMetadata: { contentType: "text/markdown; charset=utf-8" }})
   await db.update(translationJobs).set({
     status: "done",
     outputHtmlKey: htmlKey,
     outputMdKey: mdKey,
     progress: null,
   }).where(eq(translationJobs.id, jobId))
   ```
4. **Failure handling** — if renderer throws, set status='failed' with `error_message` per the canonical map (`结果保存失败...`), refund quota.
5. **Snapshot tests** — store golden HTML/MD outputs in `__tests__/fixtures/golden/` and assert byte-for-byte equality against renderer output.

---

## Open questions (settle during expansion, before TDD)

- (Q1) Anchor naming: `#page-N` vs `#segment-Nidx` — issue body says "anchor jumps to corresponding page". Default: `#page-N` based on `startPage`; multiple segments per page share an anchor (browsers jump to first match — fine).
- (Q2) Source title detection: just take first 100 chars of segment[0].source after stripping leading whitespace. Don't try to detect H1.
- (Q3) Generated-at: ISO 8601 in UTC. Render as `{date} UTC` to avoid TZ confusion.
- (Q4) Keep `segments.json` after success? Default: yes — useful for debugging. M6.12's cleanup deletes it alongside outputs.

---

## Pre-conditions for expansion

Before writing the full TDD plan, verify:
- [ ] M6.9 has merged and `segments.json` is being produced in dev
- [ ] The actual `SegmentResult` shape matches the M6.9 plan's contract (no drift)
- [ ] No surprises in unpdf output (e.g., unexpected whitespace patterns)

Once verified, run `/writing-plans` to produce `2026-04-26-m6-10-bilingual-writer-detailed.md` (or fold detail into this file).
