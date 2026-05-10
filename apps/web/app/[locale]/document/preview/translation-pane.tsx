"use client"

import { useEffect, useRef } from "react"
import type { PageSegments } from "./segments"

export function TranslationPane({
  pages,
  currentPage,
  labels,
  onPageSelect,
}: {
  pages: PageSegments[]
  currentPage: number
  labels: {
    translatedPageTemplate: string
    emptyPage: string
  }
  onPageSelect: (page: number) => void
}) {
  const paneRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const page = paneRef.current?.querySelector(`[data-page="${currentPage}"]`)
    if (page instanceof HTMLElement) {
      page.scrollIntoView({ block: "start", behavior: "smooth" })
    }
  }, [currentPage])

  return (
    <div className="translation-pane" ref={paneRef} aria-label="Translated text">
      {pages.map(page => (
        <section
          key={page.page}
          data-page={page.page}
          className={`translation-page ${page.page === currentPage ? "active" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => onPageSelect(page.page)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              onPageSelect(page.page)
            }
          }}
        >
          <h2>{labels.translatedPageTemplate.replace("{page}", String(page.page))}</h2>
          {page.segments.length === 0 ? (
            <p className="translation-page-empty">{labels.emptyPage}</p>
          ) : (
            page.segments.map(segment => (
              <article key={segment.index} className="translation-segment">
                <p>{segment.translation}</p>
                {segment.endPage > segment.startPage && (
                  <span className="translation-continuation">
                    {segment.startPage}-{segment.endPage}
                  </span>
                )}
              </article>
            ))
          )}
        </section>
      ))}
    </div>
  )
}
