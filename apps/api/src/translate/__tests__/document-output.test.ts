import { describe, expect, it } from "vitest"
import { renderHtml, renderMarkdown, deriveTitle } from "../document-output"
import type { SegmentsFile } from "../document-pipeline"

const fixture: SegmentsFile = {
  jobId: "j1",
  modelId: "google",
  sourceLang: "auto",
  targetLang: "zh-Hans",
  generatedAt: "2026-04-26T15:00:00.000Z",
  segments: [
    { index: 0, source: "Hello, world.", translation: "你好，世界。", startPage: 1, endPage: 1, modelId: "google" },
    { index: 1, source: "Second paragraph.", translation: "第二段。", startPage: 1, endPage: 2, modelId: "google" },
    { index: 2, source: "Page 2 starts here.", translation: "第二页从此处开始。", startPage: 2, endPage: 2, modelId: "google" },
  ],
}

describe("deriveTitle", () => {
  it("uses first 100 chars of segments[0].source", () => {
    expect(deriveTitle(fixture)).toBe("Hello, world.")
  })
  it("trims whitespace", () => {
    const f = { ...fixture, segments: [{ ...fixture.segments[0], source: "   leading & trailing   " }, ...fixture.segments.slice(1)] }
    expect(deriveTitle(f)).toBe("leading & trailing")
  })
  it("falls back to default when no segments", () => {
    expect(deriveTitle({ ...fixture, segments: [] })).toBe("翻译结果")
  })
  it("truncates at 100 chars", () => {
    const long = "a".repeat(150)
    const f = { ...fixture, segments: [{ ...fixture.segments[0], source: long }] }
    expect(deriveTitle(f).length).toBe(100)
  })
})

describe("renderHtml", () => {
  it("produces a self-contained HTML5 document with inline CSS", () => {
    const html = renderHtml(fixture)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<html lang="zh-Hans">')
    expect(html).toContain("<style>")
    expect(html).toContain("</style>")
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/)
    expect(html).not.toMatch(/<script\s/)  // no scripts
  })

  it("escapes HTML in source/translation strings", () => {
    const f = {
      ...fixture,
      segments: [{ ...fixture.segments[0], source: "<script>alert('xss')</script>", translation: "1 < 2 & 2 > 1" }],
    }
    const html = renderHtml(f)
    expect(html).not.toContain("<script>alert")
    expect(html).toContain("&lt;script&gt;alert")
    expect(html).toContain("1 &lt; 2 &amp; 2 &gt; 1")
  })

  it("renders one <section> per segment with data-page attribute", () => {
    const html = renderHtml(fixture)
    const sections = html.match(/<section[^>]+>/g) ?? []
    expect(sections.length).toBe(3)
    expect(html).toContain('data-page="1"')
    expect(html).toContain('data-page="2"')
  })

  it("assigns id=page-N to the first segment of each page only", () => {
    const html = renderHtml(fixture)
    expect(html).toContain('id="page-1"')
    expect(html).toContain('id="page-2"')
    // Ensure no duplicate id="page-1"
    expect((html.match(/id="page-1"/g) ?? []).length).toBe(1)
  })

  it("includes meta header with model + langs + generatedAt", () => {
    const html = renderHtml(fixture)
    expect(html).toContain("auto")
    expect(html).toContain("zh-Hans")
    expect(html).toContain("2026-04-26T15:00:00")
    // model display name (depends on TRANSLATE_MODEL_BY_ID)
    expect(html).toMatch(/谷歌/)  // "谷歌翻译"
  })

  it("falls back to default title when first segment is empty", () => {
    const f = { ...fixture, segments: [{ ...fixture.segments[0], source: "" }, ...fixture.segments.slice(1)] }
    const html = renderHtml(f)
    expect(html).toContain("<title>翻译结果</title>")
  })
})

describe("renderMarkdown", () => {
  it("starts with H1 title", () => {
    const md = renderMarkdown(fixture)
    expect(md).toMatch(/^# Hello, world\./)
  })

  it("includes blockquote meta header", () => {
    const md = renderMarkdown(fixture)
    expect(md).toMatch(/> Source: auto → Target: zh-Hans/)
    expect(md).toMatch(/> Generated: 2026-04-26T15:00:00\.000Z UTC/)
  })

  it("alternates source then translation per segment, separated by ---", () => {
    const md = renderMarkdown(fixture)
    // Count `---` separators (after meta header + between/after segments)
    const hrCount = (md.match(/^---$/gm) ?? []).length
    // 1 after header + 3 segments each ending with ---
    expect(hrCount).toBeGreaterThanOrEqual(3)
    // Verify ordering
    const helloIdx = md.indexOf("Hello, world.")
    const greetIdx = md.indexOf("你好，世界。")
    expect(helloIdx).toBeGreaterThan(0)
    expect(greetIdx).toBeGreaterThan(helloIdx)
  })

  it("does not HTML-escape (Markdown is plain text)", () => {
    const f = {
      ...fixture,
      segments: [{ ...fixture.segments[0], source: "1 < 2 & 2 > 1", translation: "对" }],
    }
    const md = renderMarkdown(f)
    expect(md).toContain("1 < 2 & 2 > 1")
    expect(md).not.toContain("&lt;")
  })

  it("returns a non-empty string for empty segments", () => {
    const md = renderMarkdown({ ...fixture, segments: [] })
    expect(md).toContain("# 翻译结果")  // title fallback
  })
})
