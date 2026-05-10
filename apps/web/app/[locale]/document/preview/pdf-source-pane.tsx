"use client"

import { useEffect, useRef, useState } from "react"
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist"

export type PdfOutlineItem = {
  title: string
  pageNumber: number
}

export function PdfSourcePane({
  url,
  pageCount,
  zoom,
  onPageChange,
  onOutline,
}: {
  url: string
  pageCount: number
  zoom: number
  onPageChange: (page: number) => void
  onOutline: (items: PdfOutlineItem[]) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const destroyRef = useRef<Promise<void>>(Promise.resolve())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let pdf: PDFDocumentProxy | null = null
    let loadingTask: PDFDocumentLoadingTask | null = null
    const renderTasks = new Set<RenderTask>()

    async function renderPage(page: PDFPageProxy, host: HTMLElement) {
      const viewport = page.getViewport({ scale: zoom })
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")
      if (!context) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.className = "pdf-reader-page-canvas"
      host.appendChild(canvas)
      const renderTask = page.render({ canvasContext: context, viewport })
      renderTasks.add(renderTask)
      try {
        await renderTask.promise
      } finally {
        renderTasks.delete(renderTask)
      }
    }

    function isPageRef(value: unknown): value is { num: number; gen: number } {
      return Boolean(value)
        && typeof value === "object"
        && typeof (value as { num?: unknown }).num === "number"
        && typeof (value as { gen?: unknown }).gen === "number"
    }

    async function resolveOutlinePage(doc: PDFDocumentProxy, dest: string | Array<unknown> | null): Promise<number | null> {
      const explicitDest = typeof dest === "string" ? await doc.getDestination(dest) : dest
      const first = explicitDest?.[0]
      if (typeof first === "number") return first + 1
      if (isPageRef(first)) return (await doc.getPageIndex(first)) + 1
      return null
    }

    async function readOutline(doc: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
      const outline = await doc.getOutline()
      const items: PdfOutlineItem[] = []

      async function visit(nodes: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>, depth: number) {
        for (const node of nodes ?? []) {
          const pageNumber = await resolveOutlinePage(doc, node.dest)
          if (pageNumber && pageNumber >= 1 && pageNumber <= doc.numPages) {
            items.push({
              title: `${"  ".repeat(depth)}${node.title}`,
              pageNumber,
            })
          }
          if (node.items.length > 0) await visit(node.items, depth + 1)
        }
      }

      await visit(outline, 0)
      return items
    }

    async function load() {
      try {
        await destroyRef.current
        if (cancelled) return
        setError(null)
        const pdfjs = await import("pdfjs-dist/webpack.mjs")
        if (cancelled) return
        loadingTask = pdfjs.getDocument(url)
        const doc = await loadingTask.promise
        if (cancelled) {
          await doc.destroy()
          return
        }
        pdf = doc
        const host = pagesRef.current
        if (!host) return
        host.replaceChildren()
        const totalPages = Math.min(doc.numPages, pageCount || doc.numPages)
        const outlinePromise = readOutline(doc).catch(() => [])
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
          const pageHost = document.createElement("section")
          pageHost.className = "pdf-reader-page"
          pageHost.dataset.page = String(pageNumber)
          host.appendChild(pageHost)
          const page = await doc.getPage(pageNumber)
          if (cancelled) return
          await renderPage(page, pageHost)
        }
        if (!cancelled) onOutline(await outlinePromise)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render PDF")
      }
    }

    void load()
    return () => {
      cancelled = true
      renderTasks.forEach(task => task.cancel())
      const teardown = pdf ? pdf.destroy() : loadingTask?.destroy()
      destroyRef.current = teardown?.catch(() => undefined) ?? Promise.resolve()
    }
  }, [url, pageCount, zoom, onOutline])

  useEffect(() => {
    const root = containerRef.current
    const host = pagesRef.current
    if (!root || !host) return
    const ratios = new Map<Element, number>()
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) ratios.set(entry.target, entry.intersectionRatio)
          else ratios.delete(entry.target)
        }
        const visible = Array.from(ratios.entries())
          .sort((a, b) => b[1] - a[1])[0]?.[0]
        const page = visible instanceof HTMLElement ? Number(visible.dataset.page) : 0
        if (page > 0) onPageChange(page)
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    )

    const observePages = () => {
      ratios.clear()
      observer.disconnect()
      host.querySelectorAll(".pdf-reader-page").forEach(el => observer.observe(el))
    }
    observePages()
    const mutationObserver = new MutationObserver(observePages)
    mutationObserver.observe(host, { childList: true })

    return () => {
      mutationObserver.disconnect()
      observer.disconnect()
    }
  }, [pageCount, onPageChange])

  return (
    <div className="pdf-source-pane" ref={containerRef} aria-label="Source PDF">
      <div className="pdf-source-pages" ref={pagesRef} />
      {error && <div className="pdf-reader-error" role="alert">{error}</div>}
    </div>
  )
}
