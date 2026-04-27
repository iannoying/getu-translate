"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { orpcClient } from "@/lib/orpc-client"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import type { DocumentListItem } from "@getu/contract"
import type { Messages } from "@/lib/i18n/messages"

export type PdfHistoryDrawerLabels = Messages["document"]["preview"]["historyDrawer"]

const STORAGE_KEY = "getu.document.historyDrawer.open"
const PAGE_SIZE = 10

function readInitialOpen(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

function writeOpen(open: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "true" : "false")
  } catch {
    // Non-fatal in private browsing.
  }
}

function formatRelative(createdAtIso: string, locale: string): string {
  const diffMs = Date.now() - Date.parse(createdAtIso)
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return locale.startsWith("zh") ? "刚刚" : "just now"
  if (diffMin < 60) return locale.startsWith("zh") ? `${diffMin} 分钟前` : `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return locale.startsWith("zh") ? `${diffHr} 小时前` : `${diffHr} h ago`
  const diffDay = Math.floor(diffHr / 24)
  return locale.startsWith("zh") ? `${diffDay} 天前` : `${diffDay} d ago`
}

function statusBadgeClass(status: DocumentListItem["status"]): string {
  switch (status) {
    case "done": return "pdf-history-badge pdf-history-badge-done"
    case "failed": return "pdf-history-badge pdf-history-badge-failed"
    case "processing": return "pdf-history-badge pdf-history-badge-processing"
    default: return "pdf-history-badge pdf-history-badge-queued"
  }
}

export function PdfHistoryDrawer({
  locale,
  labels,
  currentJobId,
}: {
  locale: Locale
  labels: PdfHistoryDrawerLabels
  currentJobId?: string
}) {
  // SSR: always closed; client syncs from localStorage after mount.
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<DocumentListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsOpen(readInitialOpen())
  }, [])

  // Load first page when drawer opens for the first time.
  useEffect(() => {
    if (!isOpen) return
    if (items.length > 0) return // Already loaded.
    let cancelled = false
    setLoading(true)
    orpcClient.translate.document
      .list({ limit: PAGE_SIZE })
      .then(res => {
        if (cancelled) return
        setItems(res.items)
        setNextCursor(res.nextCursor)
      })
      .catch(() => {
        // Swallow: drawer stays empty, user can still navigate.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, items.length])

  function toggle() {
    const next = !isOpen
    setIsOpen(next)
    writeOpen(next)
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await orpcClient.translate.document.list({
        limit: PAGE_SIZE,
        cursor: nextCursor,
      })
      setItems(prev => [...prev, ...res.items])
      setNextCursor(res.nextCursor)
    } catch {
      // Non-fatal.
    } finally {
      setLoadingMore(false)
    }
  }

  function navigateToJob(jobId: string) {
    router.push(localeHref(locale, `/document/preview?jobId=${jobId}`))
  }

  const statusLabels = useMemo(
    () => ({
      done: labels.statusDone,
      failed: labels.statusFailed,
      processing: labels.statusProcessing,
      queued: labels.statusQueued,
    }),
    [labels],
  )

  return (
    <aside
      className={`history-drawer pdf-history-drawer ${isOpen ? "history-drawer-open" : "history-drawer-closed"}`}
      aria-label={isOpen ? labels.toggleClose : labels.toggleOpen}
    >
      <button
        type="button"
        className="history-drawer-toggle"
        onClick={toggle}
        aria-expanded={isOpen}
      >
        {isOpen ? labels.toggleClose : labels.toggleOpen}
      </button>

      {isOpen && (
        <div className="history-drawer-body">
          <p className="pdf-history-retention-notice">{labels.retentionNotice}</p>

          {loading && items.length === 0 ? (
            <p className="history-drawer-empty">{labels.loading}</p>
          ) : items.length === 0 ? (
            <p className="history-drawer-empty">{labels.emptyState}</p>
          ) : (
            <>
              <ul className="history-drawer-list pdf-history-list">
                {items.map(item => {
                  const isActive = item.id === currentJobId
                  return (
                    <li key={item.id} className={`history-drawer-item pdf-history-item${isActive ? " active" : ""}`}>
                      <button
                        type="button"
                        className="history-drawer-item-restore pdf-history-item-btn"
                        onClick={() => navigateToJob(item.id)}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className="history-drawer-item-text">
                          {item.sourceFilename ?? item.id}
                        </span>
                        <span className="history-drawer-item-meta">
                          <span className={statusBadgeClass(item.status)}>
                            {statusLabels[item.status]}
                          </span>
                          <span className="history-drawer-lang-badge">
                            {item.sourceLang} → {item.targetLang}
                          </span>
                          <span className="history-drawer-time">
                            {formatRelative(item.createdAt, locale)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {nextCursor && (
                <div className="pdf-history-load-more">
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? labels.loadingMore : labels.loadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  )
}
