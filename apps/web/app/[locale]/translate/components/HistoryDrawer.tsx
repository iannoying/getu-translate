"use client"

import { useEffect, useMemo, useState } from "react"

/**
 * One row from `translate.listHistory` already mapped to the client shape.
 * `results` is `Record<modelId, { text } | { error }>`. The drawer only
 * shows the input + lang + time; restoring is delegated to the parent.
 */
export interface HistoryEntry {
  id: string
  sourceText: string
  sourceLang: string
  targetLang: string
  results: Record<string, { text: string } | { error: string }>
  /** ISO 8601. */
  createdAt: string
}

export interface HistoryDrawerLabels {
  toggleOpen: string
  toggleClose: string
  searchPlaceholder: string
  clearAllButton: string
  emptyState: string
  loading: string
  groupToday: string
  groupYesterday: string
  groupThisWeek: string
  groupOlder: string
  /** Template like `{count} entries` — `{count}` interpolated. */
  clearConfirmTemplate: string
  deleteEntryAriaLabel: string
}

const STORAGE_KEY = "getu.translate.historyDrawer.open"

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
    // localStorage may throw in strict mode / private browsing — non-fatal.
  }
}

type GroupKey = "today" | "yesterday" | "thisWeek" | "older"

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function groupOf(createdAtMs: number, nowMs: number): GroupKey {
  const today = startOfDay(new Date(nowMs)).getTime()
  const yesterday = today - 24 * 60 * 60 * 1000
  const sixDaysAgo = today - 6 * 24 * 60 * 60 * 1000
  if (createdAtMs >= today) return "today"
  if (createdAtMs >= yesterday) return "yesterday"
  if (createdAtMs >= sixDaysAgo) return "thisWeek"
  return "older"
}

const GROUP_ORDER: GroupKey[] = ["today", "yesterday", "thisWeek", "older"]

function formatRelative(createdAtMs: number, nowMs: number, locale: string): string {
  const diffMs = nowMs - createdAtMs
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return locale.startsWith("zh") ? "刚刚" : "just now"
  if (diffMin < 60) return locale.startsWith("zh") ? `${diffMin} 分钟前` : `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return locale.startsWith("zh") ? `${diffHr} 小时前` : `${diffHr} h ago`
  const diffDay = Math.floor(diffHr / 24)
  return locale.startsWith("zh") ? `${diffDay} 天前` : `${diffDay} d ago`
}

function snippetOf(text: string, max = 60): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

export function HistoryDrawer({
  entries,
  loading,
  locale,
  labels,
  onRestore,
  onDelete,
  onClear,
}: {
  entries: HistoryEntry[]
  loading: boolean
  locale: string
  labels: HistoryDrawerLabels
  onRestore: (entry: HistoryEntry) => void
  onDelete: (id: string) => Promise<void> | void
  onClear: () => Promise<void> | void
}) {
  // Hydration safety: SSR always renders closed; client mounts read
  // localStorage in useEffect. Otherwise SSR vs CSR diverge for users with
  // a "true" preference and React logs a hydration warning.
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    setIsOpen(readInitialOpen())
  }, [])

  function toggle() {
    const next = !isOpen
    setIsOpen(next)
    writeOpen(next)
  }

  // Recompute "now" only when the drawer opens to avoid re-rendering the
  // entire list every minute. The relative-time strings drift slightly but
  // for a side panel that's acceptable; users get a fresh time on next
  // open.
  const nowMs = useMemo(() => Date.now(), [isOpen, entries.length])

  const filtered = useMemo(() => {
    if (!query) return entries
    return entries.filter(e => fuzzyMatch(e.sourceText, query))
  }, [entries, query])

  const grouped = useMemo(() => {
    const groups: Record<GroupKey, HistoryEntry[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    }
    for (const entry of filtered) {
      const ms = Date.parse(entry.createdAt)
      groups[groupOf(ms, nowMs)].push(entry)
    }
    return groups
  }, [filtered, nowMs])

  const groupLabel: Record<GroupKey, string> = {
    today: labels.groupToday,
    yesterday: labels.groupYesterday,
    thisWeek: labels.groupThisWeek,
    older: labels.groupOlder,
  }

  async function handleClear() {
    const ok = window.confirm(
      formatTemplate(labels.clearConfirmTemplate, { count: entries.length }),
    )
    if (!ok) return
    await onClear()
  }

  return (
    <aside
      className={`history-drawer ${isOpen ? "history-drawer-open" : "history-drawer-closed"}`}
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
          <div className="history-drawer-controls">
            <input
              type="search"
              className="history-drawer-search"
              value={query}
              placeholder={labels.searchPlaceholder}
              onChange={e => setQuery(e.target.value)}
            />
            {entries.length > 0 && (
              <button
                type="button"
                className="button secondary small"
                onClick={handleClear}
              >
                {labels.clearAllButton}
              </button>
            )}
          </div>

          {loading && entries.length === 0 ? (
            <p className="history-drawer-empty">{labels.loading}</p>
          ) : entries.length === 0 ? (
            <p className="history-drawer-empty">{labels.emptyState}</p>
          ) : (
            <div className="history-drawer-groups">
              {GROUP_ORDER.map((key) => {
                const items = grouped[key]
                if (items.length === 0) return null
                return (
                  <section key={key} className="history-drawer-group">
                    <h3 className="history-drawer-group-title">{groupLabel[key]}</h3>
                    <ul className="history-drawer-list">
                      {items.map((entry) => {
                        const ms = Date.parse(entry.createdAt)
                        return (
                          <li key={entry.id} className="history-drawer-item">
                            <button
                              type="button"
                              className="history-drawer-item-restore"
                              onClick={() => onRestore(entry)}
                            >
                              <span className="history-drawer-item-text">
                                {snippetOf(entry.sourceText)}
                              </span>
                              <span className="history-drawer-item-meta">
                                <span className="history-drawer-lang-badge">
                                  {entry.sourceLang} → {entry.targetLang}
                                </span>
                                <span className="history-drawer-time">
                                  {formatRelative(ms, nowMs, locale)}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="history-drawer-item-delete"
                              aria-label={labels.deleteEntryAriaLabel}
                              onClick={() => onDelete(entry.id)}
                            >
                              ✕
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
