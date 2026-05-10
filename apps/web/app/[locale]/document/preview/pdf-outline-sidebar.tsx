"use client"

import type { PdfOutlineItem } from "./pdf-source-pane"

export function PdfOutlineSidebar({
  open,
  outline,
  pageCount,
  currentPage,
  onPageSelect,
}: {
  open: boolean
  outline: PdfOutlineItem[]
  pageCount: number
  currentPage: number
  onPageSelect: (page: number) => void
}) {
  if (!open) return null
  const items = outline.length > 0
    ? outline
    : Array.from({ length: pageCount }, (_, idx) => ({
        title: `Page ${idx + 1}`,
        pageNumber: idx + 1,
      }))

  return (
    <aside className="pdf-reader-sidebar" aria-label="PDF navigation">
      {items.map(item => (
        <button
          key={`${item.pageNumber}-${item.title}`}
          type="button"
          className={item.pageNumber === currentPage ? "active" : ""}
          aria-current={item.pageNumber === currentPage ? "page" : undefined}
          onClick={() => onPageSelect(item.pageNumber)}
        >
          {item.title}
        </button>
      ))}
    </aside>
  )
}
