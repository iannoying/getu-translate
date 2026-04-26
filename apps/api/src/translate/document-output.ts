import { TRANSLATE_MODEL_BY_ID } from "@getu/definitions"
import type { SegmentsFile } from "./document-pipeline"

export type RenderMeta = {
  title: string
  modelDisplay: string
}

export function deriveTitle(file: SegmentsFile): string {
  if (file.segments.length === 0) return "翻译结果"
  const raw = file.segments[0].source.trim()
  if (!raw) return "翻译结果"
  return [...raw].slice(0, 100).join("")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function getModelDisplay(modelId: string): string {
  const model = Object.hasOwn(TRANSLATE_MODEL_BY_ID, modelId)
    ? TRANSLATE_MODEL_BY_ID[modelId as keyof typeof TRANSLATE_MODEL_BY_ID]
    : undefined
  return model?.displayName ?? modelId
}

export function renderHtml(file: SegmentsFile): string {
  const title = deriveTitle(file)
  const modelDisplay = getModelDisplay(file.modelId)
  const seenPages = new Set<number>()

  const sections = file.segments.map((seg) => {
    const page = seg.startPage
    const isFirstOnPage = !seenPages.has(page)
    if (isFirstOnPage) seenPages.add(page)
    const pageAttr = isFirstOnPage
      ? `data-page="${page}" id="page-${page}"`
      : `data-page="${page}"`
    return `    <section ${pageAttr}>\n      <div class="src">${escapeHtml(seg.source)}</div>\n      <div class="tgt">${escapeHtml(seg.translation)}</div>\n    </section>`
  })

  return `<!DOCTYPE html>
<html lang="${escapeHtml(file.targetLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.7;
      color: #222;
      background: #fafafa;
      padding: 1rem;
    }
    header {
      max-width: 1200px;
      margin: 0 auto 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #e0e0e0;
    }
    header h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }
    .meta {
      font-size: 0.85rem;
      color: #666;
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
    }
    section {
      margin-bottom: 1.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    }
    .src, .tgt {
      padding: 0.75rem 1rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .src {
      background: #fff;
      color: #444;
      border-bottom: 1px solid #e0e0e0;
    }
    .tgt {
      background: #f5f9ff;
      color: #222;
    }
    @media (min-width: 768px) {
      section {
        display: flex;
        flex-direction: row;
      }
      .src {
        flex: 1;
        border-bottom: none;
        border-right: 1px solid #e0e0e0;
      }
      .tgt {
        flex: 1;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">
      <span>${escapeHtml(file.sourceLang)} → ${escapeHtml(file.targetLang)}</span>
      <span>${escapeHtml(modelDisplay)}</span>
      <span>${escapeHtml(file.generatedAt)} UTC</span>
    </p>
  </header>
  <main>
${sections.join("\n")}
  </main>
</body>
</html>`
}

export function renderMarkdown(file: SegmentsFile): string {
  const title = deriveTitle(file)
  const modelDisplay = getModelDisplay(file.modelId)

  const header = [
    `# ${title}`,
    "",
    `> Source: ${file.sourceLang} → Target: ${file.targetLang}`,
    `> Model: ${modelDisplay}`,
    `> Generated: ${file.generatedAt} UTC`,
    "",
    "---",
    "",
  ].join("\n")

  if (file.segments.length === 0) return header

  const body = file.segments
    .map((seg) => `${seg.source}\n\n${seg.translation}\n\n---\n`)
    .join("\n")

  return header + body
}
