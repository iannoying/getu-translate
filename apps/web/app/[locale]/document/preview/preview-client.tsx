"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { orpcClient } from "@/lib/orpc-client"
import { track } from "@/lib/analytics"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import type { Messages } from "@/lib/i18n/messages"
import { TranslateShell } from "../../translate/components/TranslateShell"
import { PdfHistoryDrawer } from "../components/PdfHistoryDrawer"
import {
  applyStatusPayload,
  isTerminal,
  type PreviewState,
} from "./preview-state"

const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS = 5 * 60 * 1_000 // 5 minutes

export type PreviewMessages = Messages["document"]["preview"]
export type ShellLabels = Messages["translate"]["shell"]

export function PreviewClient({
  jobId,
  locale,
  messages,
  shellLabels,
}: {
  jobId: string
  locale: Locale
  messages: PreviewMessages
  shellLabels: ShellLabels
}) {
  const router = useRouter()
  const [state, setState] = useState<PreviewState>({ kind: "loading" })
  const [retrying, setRetrying] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Guard: fire pdf_completed exactly once per mount, even in React StrictMode.
  const completedFiredRef = useRef(false)

  useEffect(() => {
    if (!jobId) return
    const ac = new AbortController()
    abortRef.current = ac
    const startedAt = Date.now()

    async function poll() {
      // Initial fetch immediately.
      while (!ac.signal.aborted) {
        try {
          const payload = await orpcClient.translate.document.status({ jobId })
          if (ac.signal.aborted) return
          setState(prev => {
            if (isTerminal(prev)) return prev
            const next = applyStatusPayload(prev, payload)
            if (next.kind === "done" && !completedFiredRef.current) {
              completedFiredRef.current = true
              track("pdf_completed", {
                jobId,
                durationMs: Date.now() - startedAt,
              })
            }
            return next
          })
          // Check terminal after applying.
          const fresh = applyStatusPayload({ kind: "loading" }, payload)
          if (isTerminal(fresh)) return
        } catch {
          // Transient errors: keep polling.
          if (ac.signal.aborted) return
        }

        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          if (!ac.signal.aborted) setState({ kind: "timeout" })
          return
        }

        await new Promise<void>(resolve => {
          const tid = setTimeout(resolve, POLL_INTERVAL_MS)
          ac.signal.addEventListener("abort", () => {
            clearTimeout(tid)
            resolve()
          })
        })
      }
    }

    poll()
    return () => {
      ac.abort()
    }
  }, [jobId])

  const handleDownload = useCallback(
    async (format: "html" | "md") => {
      try {
        const { url } = await orpcClient.translate.document.downloadUrl({ jobId, format })
        window.open(url, "_blank", "noopener")
      } catch {
        // Non-fatal: user sees no visual change.
      }
    },
    [jobId],
  )

  const handleRetry = useCallback(async () => {
    if (retrying) return
    setRetrying(true)
    try {
      const { jobId: newJobId } = await orpcClient.translate.document.retry({ jobId })
      router.push(localeHref(locale, `/document/preview?jobId=${newJobId}`))
    } catch {
      // Non-fatal.
      setRetrying(false)
    }
  }, [jobId, locale, retrying, router])

  return (
    <TranslateShell locale={locale} labels={shellLabels}>
      <div className="document-preview-layout">
        <PdfHistoryDrawer
          locale={locale}
          labels={messages.historyDrawer}
          currentJobId={jobId}
        />
        <div className="document-preview-main">
          <div className="document-preview-status" role="status">
            {state.kind === "loading" && (
              <p className="document-preview-loading">{messages.loading}</p>
            )}

            {state.kind === "polling" && (
              <div className="document-preview-progress">
                <p>{messages.pollingStatus[state.status] ?? state.status}</p>
                {state.progress && (
                  <div className="document-preview-progress-bar-wrap" aria-label={`${state.progress.pct}%`}>
                    <div
                      className="document-preview-progress-bar"
                      style={{ width: `${state.progress.pct}%` }}
                    />
                  </div>
                )}
                {state.progress && (
                  <p className="document-preview-progress-stage">
                    {state.progress.stage} — {Math.round(state.progress.pct)}%
                  </p>
                )}
              </div>
            )}

            {state.kind === "done" && (
              <div className="document-preview-done">
                <p className="document-preview-done-msg">{messages.doneMessage}</p>
                <div className="document-preview-download-buttons">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => handleDownload("html")}
                  >
                    {messages.downloadHtml}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => handleDownload("md")}
                  >
                    {messages.downloadMd}
                  </button>
                </div>
              </div>
            )}

            {state.kind === "failed" && (
              <div className="document-preview-failed document-error" role="alert">
                <strong>{messages.errors.heading}</strong>
                <p>{state.errorMessage}</p>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? messages.retryingButton : messages.retryButton}
                </button>
              </div>
            )}

            {state.kind === "timeout" && (
              <div className="document-preview-timeout document-error" role="alert">
                <strong>{messages.errors.heading}</strong>
                <p>{messages.timeoutMessage}</p>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => window.location.reload()}
                >
                  {messages.refreshButton}
                </button>
              </div>
            )}
          </div>

          {state.kind === "done" && (
            <IframePreview jobId={jobId} messages={messages} />
          )}
        </div>
      </div>
    </TranslateShell>
  )
}

function IframePreview({
  jobId,
  messages,
}: {
  jobId: string
  messages: PreviewMessages
}) {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    orpcClient.translate.document
      .downloadUrl({ jobId, format: "html" })
      .then(({ url }) => {
        if (!cancelled) setIframeSrc(url)
      })
      .catch(() => {
        // Non-fatal: iframe stays hidden.
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  if (!iframeSrc) return null

  return (
    <iframe
      src={iframeSrc}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      className="document-preview-iframe"
      title={messages.iframeTitle}
    />
  )
}
