"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { orpcClient } from "@/lib/orpc-client"
import { track } from "@/lib/analytics"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import type { Messages } from "@/lib/i18n/messages"
import { isFreeTranslateModel, type TranslateModelId } from "@getu/definitions"
import type { DocumentPreviewOutput, Entitlements } from "@getu/contract"
import { TranslateShell } from "../../translate/components/TranslateShell"
import { UpgradeModal, type UpgradeModalSource } from "../../translate/components/UpgradeModal"
import { PdfHistoryDrawer } from "../components/PdfHistoryDrawer"
import { PdfDualReader } from "./pdf-dual-reader"
import { parseSegmentsFile, type PdfSegmentsFile } from "./segments"
import {
  applyStatusPayload,
  isTerminal,
  statusErrorToPreviewState,
  type PreviewState,
} from "./preview-state"

const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS = 5 * 60 * 1_000 // 5 minutes

export type PreviewMessages = Messages["document"]["preview"]
export type ShellLabels = Messages["translate"]["shell"]
export type UpgradeLabels = Messages["translate"]["upgradeModal"]

export function PreviewClient({
  jobId,
  locale,
  messages,
  shellLabels,
  upgradeLabels,
}: {
  jobId: string
  locale: Locale
  messages: PreviewMessages
  shellLabels: ShellLabels
  upgradeLabels: UpgradeLabels
}) {
  const router = useRouter()
  const session = authClient.useSession()
  const isAuthed = !!session.data?.user
  const [state, setState] = useState<PreviewState>({ kind: "loading" })
  const [retrying, setRetrying] = useState(false)
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [preview, setPreview] = useState<DocumentPreviewOutput | null>(null)
  const [segments, setSegments] = useState<PdfSegmentsFile | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [retranslating, setRetranslating] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeSource, setUpgradeSource] = useState<UpgradeModalSource | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Guard: fire pdf_completed exactly once per mount, even in React StrictMode.
  const completedFiredRef = useRef(false)

  useEffect(() => {
    setState({ kind: "loading" })
    setPreview(null)
    setSegments(null)
    setPreviewError(null)
    setRetranslating(false)
    completedFiredRef.current = false
  }, [jobId])

  useEffect(() => {
    if (!isAuthed) {
      setEntitlements(null)
      return
    }
    let cancelled = false
    orpcClient.billing
      .getEntitlements({})
      .then(e => {
        if (!cancelled) setEntitlements(e)
      })
      .catch(() => {
        if (!cancelled) setEntitlements(null)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed])

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
        } catch (err) {
          // Transient errors: keep polling.
          if (ac.signal.aborted) return
          const terminalState = statusErrorToPreviewState(err, messages.errors)
          if (terminalState) {
            setState(terminalState)
            return
          }
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

  useEffect(() => {
    if (state.kind !== "done") return
    let cancelled = false
    setPreviewError(null)
    orpcClient.translate.document
      .preview({ jobId })
      .then(async payload => {
        const res = await fetch(payload.segmentsJsonUrl)
        if (!res.ok) throw new Error(`segments fetch failed: ${res.status}`)
        const json = await res.json()
        const parsed = parseSegmentsFile(json)
        if (!cancelled) {
          setPreview(payload)
          setSegments(parsed)
        }
      })
      .catch(err => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : messages.errors.notFound)
      })
    return () => {
      cancelled = true
    }
  }, [state.kind, jobId, messages.errors.notFound])

  function openUpgradeModal(source: UpgradeModalSource) {
    setUpgradeSource(source)
    setUpgradeOpen(true)
  }

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

  const handleRetranslate = useCallback(async (input: {
    modelId: TranslateModelId
    sourceLang: string
    targetLang: string
  }) => {
    if (retranslating) return
    const tier = entitlements?.tier
    if (tier === "free" && !isFreeTranslateModel(input.modelId)) {
      openUpgradeModal("pro_model_clicked")
      return
    }
    setRetranslating(true)
    setPreviewError(null)
    try {
      const out = await orpcClient.translate.document.retranslate({ ...input, jobId })
      router.push(localeHref(locale, `/document/preview?jobId=${out.jobId}`))
    } catch (err) {
      const code = (err as { data?: { code?: string }; code?: string })?.data?.code
        ?? (err as { code?: string })?.code
      if (code === "INSUFFICIENT_QUOTA" || code === "QUOTA_EXCEEDED") {
        openUpgradeModal("pdf_quota_exceeded")
      } else if (code === "PRO_REQUIRED") {
        openUpgradeModal("pro_model_clicked")
      }
      setPreviewError(err instanceof Error ? err.message : messages.errors.notFound)
      setRetranslating(false)
    }
  }, [entitlements?.tier, jobId, locale, messages.errors.notFound, retranslating, router])

  return (
    <TranslateShell locale={locale} labels={shellLabels}>
      <UpgradeModal
        open={upgradeOpen}
        source={upgradeSource}
        onClose={() => setUpgradeOpen(false)}
        locale={locale}
        labels={upgradeLabels}
      />
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

          {state.kind === "done" && preview && segments && (
            <PdfDualReader
              locale={locale}
              job={preview.job}
              segments={segments}
              sourcePdfUrl={preview.sourcePdfUrl}
              htmlUrl={preview.htmlUrl}
              mdUrl={preview.mdUrl}
              entitlements={entitlements}
              labels={messages.reader}
              onRetranslate={handleRetranslate}
              retranslating={retranslating}
            />
          )}

          {state.kind === "done" && previewError && (
            <div className="document-error" role="alert">
              <strong>{messages.errors.heading}</strong>
              <p>{previewError}</p>
            </div>
          )}
        </div>
      </div>
    </TranslateShell>
  )
}
