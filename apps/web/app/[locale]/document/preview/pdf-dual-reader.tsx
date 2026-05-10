"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  TRANSLATE_MODELS,
  isFreeTranslateModel,
  type TranslateModelId,
} from "@getu/definitions"
import type { Entitlements } from "@getu/contract"
import type { Locale } from "@/lib/i18n/locales"
import type { Messages } from "@/lib/i18n/messages"
import { localeHref } from "@/lib/i18n/routing"
import { LangPicker } from "../../translate/components/LangPicker"
import { PdfOutlineSidebar } from "./pdf-outline-sidebar"
import { PdfSourcePane, type PdfOutlineItem } from "./pdf-source-pane"
import { TranslationPane } from "./translation-pane"
import { groupSegmentsByPage, type PdfSegmentsFile } from "./segments"

type ReaderLabels = Messages["document"]["preview"]["reader"]

export function PdfDualReader({
  locale,
  job,
  segments,
  sourcePdfUrl,
  htmlUrl,
  mdUrl,
  entitlements,
  labels,
  onRetranslate,
  retranslating,
}: {
  locale: Locale
  job: {
    id: string
    sourcePages: number
    modelId: string
    sourceLang: string
    targetLang: string
    sourceFilename: string | null
  }
  segments: PdfSegmentsFile
  sourcePdfUrl: string
  htmlUrl: string | null
  mdUrl: string | null
  entitlements: Entitlements | null
  labels: ReaderLabels
  onRetranslate: (input: { modelId: TranslateModelId; sourceLang: string; targetLang: string }) => void
  retranslating: boolean
}) {
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(1)
  const [scrollPage, setScrollPage] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [outline, setOutline] = useState<PdfOutlineItem[]>([])
  const [draftModel, setDraftModel] = useState<TranslateModelId>(job.modelId as TranslateModelId)
  const [draftSource, setDraftSource] = useState(job.sourceLang)
  const [draftTarget, setDraftTarget] = useState(job.targetLang)

  const pages = useMemo(
    () => groupSegmentsByPage(segments, job.sourcePages),
    [segments, job.sourcePages],
  )
  const changed = draftModel !== job.modelId || draftSource !== job.sourceLang || draftTarget !== job.targetLang
  const downloadUrl = htmlUrl ?? mdUrl
  const plan = entitlements?.tier ?? "free"
  const draftModelLocked = plan === "free" && !isFreeTranslateModel(draftModel)

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(job.sourcePages, page))
    setCurrentPage(next)
    setScrollPage(next)
  }

  return (
    <div className="pdf-reader">
      <header className="pdf-reader-topbar">
        <strong className="pdf-reader-brand">GetU</strong>
        <label>
          <span>{labels.serviceLabel}</span>
          <select value={draftModel} onChange={e => setDraftModel(e.target.value as TranslateModelId)}>
            {TRANSLATE_MODELS.map(model => {
              const locked = plan === "free" && !isFreeTranslateModel(model.id)
              return (
                <option key={model.id} value={model.id} disabled={locked}>
                  {model.displayName}{locked ? " (Pro)" : ""}
                </option>
              )
            })}
          </select>
        </label>
        <div className="pdf-reader-lang">
          <span>{labels.sourceLanguageLabel} / {labels.targetLanguageLabel}</span>
          <LangPicker
            source={draftSource}
            target={draftTarget}
            sourceLabel={labels.sourceLanguageLabel}
            targetLabel={labels.targetLanguageLabel}
            onSourceChange={setDraftSource}
            onTargetChange={setDraftTarget}
            onSwap={() => {
              if (draftSource === "auto") return
              setDraftSource(draftTarget)
              setDraftTarget(draftSource)
            }}
          />
        </div>
        <button
          type="button"
          className="button primary"
          disabled={!changed || retranslating || draftModelLocked}
          onClick={() => onRetranslate({ modelId: draftModel, sourceLang: draftSource, targetLang: draftTarget })}
        >
          {retranslating ? labels.retranslatingButton : labels.retranslateButton}
        </button>
        <button type="button" className="button secondary" onClick={() => router.push(localeHref(locale, "/document"))}>
          {labels.openNewFile}
        </button>
        {downloadUrl ? (
          <a className="button secondary" href={downloadUrl} target="_blank" rel="noreferrer">
            {labels.download}
          </a>
        ) : (
          <button type="button" className="button secondary" disabled>
            {labels.download}
          </button>
        )}
        <span className="pdf-reader-mode">{labels.standardMode}</span>
        <span className="pdf-reader-mode disabled">{labels.layoutModeComingSoon}</span>
      </header>

      <div className="pdf-reader-toolbar">
        <button type="button" onClick={() => setSidebarOpen(v => !v)}>
          {sidebarOpen ? labels.hideSidebar : labels.showSidebar}
        </button>
        <button type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>{labels.previousPage}</button>
        <span>{labels.pageTemplate.replace("{page}", String(currentPage)).replace("{total}", String(job.sourcePages))}</span>
        <button type="button" disabled={currentPage >= job.sourcePages} onClick={() => goToPage(currentPage + 1)}>{labels.nextPage}</button>
        <button type="button" disabled>{labels.searchDisabled}</button>
        <button type="button" onClick={() => setZoom(z => Math.max(0.6, z - 0.1))}>{labels.zoomOut}</button>
        <button type="button" onClick={() => setZoom(1)}>{labels.fitWidth}</button>
        <button type="button" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>{labels.zoomIn}</button>
      </div>

      <div className="pdf-reader-body">
        <PdfOutlineSidebar
          open={sidebarOpen}
          outline={outline}
          pageCount={job.sourcePages}
          currentPage={currentPage}
          onPageSelect={goToPage}
        />
        <div className="pdf-reader-columns">
          <PdfSourcePane
            url={sourcePdfUrl}
            pageCount={job.sourcePages}
            scrollPage={scrollPage}
            zoom={zoom}
            onPageChange={setCurrentPage}
            onOutline={setOutline}
          />
          <TranslationPane
            pages={pages}
            currentPage={currentPage}
            labels={labels}
            onPageSelect={goToPage}
          />
        </div>
      </div>
    </div>
  )
}
