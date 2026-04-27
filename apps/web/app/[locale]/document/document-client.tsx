"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import { orpcClient } from "@/lib/orpc-client"
import { track } from "@/lib/analytics"
import {
  TRANSLATE_MODELS,
  isFreeTranslateModel,
  type TranslateModelId,
} from "@getu/definitions"
import type { Entitlements } from "@getu/contract"
import type { Messages } from "@/lib/i18n/messages"
import { LangPicker } from "../translate/components/LangPicker"
import { QuotaBadge } from "../translate/components/QuotaBadge"
import { TranslateShell } from "../translate/components/TranslateShell"
import { UpgradeModal, type UpgradeModalSource } from "../translate/components/UpgradeModal"

const MAX_BYTES = 50 * 1024 * 1024
const MAX_PAGES = 200

type Plan = "anonymous" | "free" | "pro" | "enterprise"

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progressPct: number }
  | { kind: "creating" }
  | { kind: "from-url" }
  | { kind: "done"; jobId: string }
  | { kind: "error"; code: string; message: string }

function planFromEntitlements(e: Entitlements | null): Plan {
  if (!e) return "anonymous"
  return e.tier
}

function visibleModelsForPlan(plan: Plan): TranslateModelId[] {
  if (plan === "free") return TRANSLATE_MODELS.filter(m => isFreeTranslateModel(m.id)).map(m => m.id)
  if (plan === "pro" || plan === "enterprise") return TRANSLATE_MODELS.map(m => m.id)
  // Anonymous users see the picker but submit triggers a redirect to log-in.
  return TRANSLATE_MODELS.map(m => m.id)
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8788"

function presignUpload(filename: string, contentLength: number) {
  return fetch(`${API_BASE}/api/translate/document/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ filename, contentLength }),
  })
}

function fromUrl(payload: { src: string; modelId: string; sourceLang: string; targetLang: string }) {
  return fetch(`${API_BASE}/api/translate/document/from-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  })
}

/**
 * Upload `file` to a presigned R2 URL with progress feedback.
 *
 * We use XHR (not fetch) because fetch's upload progress is still not
 * widely supported (`ReadableStream` upload progress requires duplex:'half'
 * + recent browser). XHR's `onprogress` is the deterministic path.
 */
function putWithProgress(uploadUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("R2 upload network error"))
    // R2 expects content-type to match what we declared at presign time —
    // pdf-only here.
    xhr.setRequestHeader("Content-Type", "application/pdf")
    xhr.send(file)
  })
}

export type DocumentMessages = Messages["document"]
export type ShellLabels = Messages["translate"]["shell"]
export type UpgradeLabels = Messages["translate"]["upgradeModal"]

const MAX_DISPLAY_URL = 80

function truncateUrl(src: string): string {
  if (src.length <= MAX_DISPLAY_URL) return src
  return `${src.slice(0, MAX_DISPLAY_URL - 3)}...`
}

export function DocumentClient({
  locale,
  messages,
  shellLabels,
  upgradeLabels,
  quotaLabels,
}: {
  locale: Locale
  messages: DocumentMessages
  shellLabels: ShellLabels
  upgradeLabels: UpgradeLabels
  quotaLabels: { label: string; tooltip: string }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = authClient.useSession()
  const isAuthed = !!session.data?.user
  const isLoadingSession = session.isPending

  // Parse `?src=` client-side (apps/web is `output: "export"` — server
  // can't read searchParams without dynamic rendering). Validate the URL +
  // truncate display BEFORE inserting into HTML so unsafe src strings
  // can't render JS.
  const { srcUrl, srcDisplay, loginNext } = useMemo(() => {
    const raw = searchParams?.get("src")
    if (!raw) {
      return { srcUrl: null, srcDisplay: null, loginNext: localeHref(locale, "/document") }
    }
    try {
      const parsed = new URL(raw)
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { srcUrl: null, srcDisplay: null, loginNext: localeHref(locale, "/document") }
      }
      const safeUrl = parsed.toString()
      return {
        srcUrl: safeUrl,
        srcDisplay: truncateUrl(safeUrl),
        loginNext: `${localeHref(locale, "/document")}?src=${encodeURIComponent(safeUrl)}`,
      }
    } catch {
      return { srcUrl: null, srcDisplay: null, loginNext: localeHref(locale, "/document") }
    }
  }, [searchParams, locale])

  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)

  useEffect(() => {
    if (!isAuthed) {
      setEntitlements(null)
      return
    }
    let cancelled = false
    orpcClient.billing
      .getEntitlements({})
      .then((e) => {
        if (!cancelled) setEntitlements(e)
      })
      .catch((err) => {
        if (cancelled) return
        // eslint-disable-next-line no-console -- helps M6 ops trace entitlements outage
        console.warn("[document] getEntitlements failed", err)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed])

  const plan: Plan = isAuthed ? planFromEntitlements(entitlements) : "anonymous"

  const [file, setFile] = useState<File | null>(null)
  const [modelId, setModelId] = useState<TranslateModelId>("google")
  const [source, setSource] = useState("auto")
  const [target, setTarget] = useState("zh-CN")
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [dragOver, setDragOver] = useState(false)

  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeSource, setUpgradeSource] = useState<UpgradeModalSource | null>(null)
  function openUpgradeModal(s: UpgradeModalSource) {
    setUpgradeSource(s)
    setUpgradeOpen(true)
  }

  // `?src=` auto-flow: kick off from-url once we know the user is signed in.
  // Uses a ref guard so React StrictMode double-effect doesn't double-fire.
  const fromUrlFiredRef = useRef(false)
  useEffect(() => {
    if (!srcUrl) return
    if (isLoadingSession) return
    if (!isAuthed) {
      router.push(localeHref(locale, `/log-in?redirect=${encodeURIComponent(loginNext)}`))
      return
    }
    if (fromUrlFiredRef.current) return
    fromUrlFiredRef.current = true
    setPhase({ kind: "from-url" })
    ;(async () => {
      try {
        const res = await fromUrl({ src: srcUrl, modelId, sourceLang: source, targetLang: target })
        const body = (await res.json().catch(() => null)) as { jobId?: string; error?: string; message?: string } | null
        if (!res.ok) {
          const code = body?.error ?? "from_url_failed"
          if (code === "INSUFFICIENT_QUOTA") openUpgradeModal("pdf_quota_exceeded")
          setPhase({ kind: "error", code, message: body?.message ?? messages.errors.fromUrlFailed })
          return
        }
        if (!body?.jobId) {
          setPhase({ kind: "error", code: "no_job_id", message: messages.errors.fromUrlFailed })
          return
        }
        track("pdf_uploaded", {
          sizeMb: 0,  // from-url path: file size unknown client-side
          modelId,
        })
        setPhase({ kind: "done", jobId: body.jobId })
        router.push(localeHref(locale, `/document/preview?jobId=${body.jobId}`))
      } catch (err) {
        setPhase({
          kind: "error",
          code: "fetch_failed",
          message: err instanceof Error ? err.message : messages.errors.fromUrlFailed,
        })
      }
    })()
    // intentionally exclude modelId/source/target — `?src=` flow uses the
    // initial defaults (the user can re-trigger via manual upload to change them)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl, isAuthed, isLoadingSession])

  function handleFile(picked: File | null) {
    setPhase({ kind: "idle" })
    if (!picked) {
      setFile(null)
      return
    }
    if (!picked.name.toLowerCase().endsWith(".pdf") && picked.type !== "application/pdf") {
      setPhase({ kind: "error", code: "NOT_PDF", message: messages.errors.notPdf })
      return
    }
    if (picked.size > MAX_BYTES) {
      setPhase({ kind: "error", code: "TOO_LARGE", message: messages.errors.fileTooLarge })
      return
    }
    setFile(picked)
  }

  async function handleSubmit() {
    if (!isAuthed) {
      router.push(localeHref(locale, `/log-in?redirect=${encodeURIComponent(loginNext)}`))
      return
    }
    if (!file) return
    if (plan === "free" && !isFreeTranslateModel(modelId)) {
      openUpgradeModal("pro_model_clicked")
      return
    }
    setPhase({ kind: "uploading", progressPct: 0 })
    try {
      // 1. Presign.
      const presignRes = await presignUpload(file.name, file.size)
      if (presignRes.status === 401) {
        router.push(localeHref(locale, `/log-in?redirect=${encodeURIComponent(loginNext)}`))
        return
      }
      if (presignRes.status === 503) {
        setPhase({ kind: "error", code: "R2_UNAVAILABLE", message: messages.errors.r2Unavailable })
        return
      }
      if (!presignRes.ok) {
        setPhase({ kind: "error", code: "presign_failed", message: messages.errors.presignFailed })
        return
      }
      const { uploadUrl, sourceKey } = (await presignRes.json()) as {
        uploadUrl: string
        sourceKey: string
      }
      // 2. Direct PUT to R2 with progress.
      await putWithProgress(uploadUrl, file, (pct) => {
        setPhase({ kind: "uploading", progressPct: pct })
      })
      // 3. Create job. Server reads pages via pdf-lib, validates quota.
      setPhase({ kind: "creating" })
      const out = await orpcClient.translate.document.create({
        sourceKey,
        // sourcePages is mostly informational — server overrides with the
        // pdf-lib parse. We send a placeholder to satisfy the schema.
        sourcePages: 1,
        sourceFilename: file.name,
        sourceBytes: file.size,
        modelId,
        sourceLang: source,
        targetLang: target,
      })
      track("pdf_uploaded", {
        sizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
        modelId,
      })
      setPhase({ kind: "done", jobId: out.jobId })
      router.push(localeHref(locale, `/document/preview?jobId=${out.jobId}`))
    } catch (err) {
      const data = (err as { data?: { code?: string }; code?: string })?.data
      const code = data?.code ?? (err as { code?: string })?.code ?? "unknown"
      const msg = err instanceof Error ? err.message : messages.errors.uploadFailed
      if (code === "INSUFFICIENT_QUOTA" || code === "QUOTA_EXCEEDED") {
        openUpgradeModal("pdf_quota_exceeded")
      } else if (code === "PRO_REQUIRED") {
        openUpgradeModal("pro_model_clicked")
      }
      setPhase({ kind: "error", code, message: msg })
    }
  }

  const handleSwap = useCallback(() => {
    if (source === "auto") return
    setSource(target)
    setTarget(source)
  }, [source, target])

  const visible = visibleModelsForPlan(plan)
  const submitDisabled =
    !file ||
    phase.kind === "uploading" ||
    phase.kind === "creating" ||
    phase.kind === "from-url"

  return (
    <TranslateShell locale={locale} labels={shellLabels}>
      <UpgradeModal
        open={upgradeOpen}
        source={upgradeSource}
        onClose={() => setUpgradeOpen(false)}
        locale={locale}
        labels={upgradeLabels}
      />
      <div className="document-page">
        <header className="translate-toolbar">
          <LangPicker
            source={source}
            target={target}
            onSourceChange={setSource}
            onTargetChange={setTarget}
            onSwap={handleSwap}
          />
          <div className="translate-toolbar-spacer" />
          <QuotaBadge
            quota={entitlements?.quota ?? {}}
            label={quotaLabels.label}
            tooltipTemplate={quotaLabels.tooltip}
          />
        </header>

        {srcDisplay && phase.kind !== "done" && (
          <div className="document-from-url-banner" role="status">
            <strong>{messages.fromUrl.heading}</strong>
            <code className="document-from-url-link" title={srcDisplay}>
              {srcDisplay}
            </code>
          </div>
        )}

        <section
          className={`document-dropzone ${dragOver ? "drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0] ?? null
            handleFile(f)
          }}
        >
          {file ? (
            <div className="document-file-info">
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              <button type="button" className="button secondary small" onClick={() => setFile(null)}>
                {messages.clearFile}
              </button>
            </div>
          ) : (
            <>
              <p className="document-dropzone-hint">{messages.dragDropHint}</p>
              <label className="button primary">
                {messages.uploadButton}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="document-dropzone-meta">
                {messages.limitsTemplate
                  .replace("{maxMB}", String(MAX_BYTES / 1024 / 1024))
                  .replace("{maxPages}", String(MAX_PAGES))}
              </p>
            </>
          )}
        </section>

        <section className="document-options">
          <label className="document-option">
            <span>{messages.modelPicker}</span>
            <select value={modelId} onChange={(e) => setModelId(e.target.value as TranslateModelId)}>
              {visible.map((id) => {
                const m = TRANSLATE_MODELS.find((x) => x.id === id)
                if (!m) return null
                const proOnly = !isFreeTranslateModel(id) && plan === "free"
                return (
                  <option key={id} value={id} disabled={proOnly}>
                    {m.displayName}
                    {proOnly ? ` ${messages.modelLockedSuffix}` : ""}
                  </option>
                )
              })}
            </select>
          </label>
        </section>

        <section className="document-actions">
          <button
            type="button"
            className="button primary"
            onClick={handleSubmit}
            disabled={submitDisabled}
          >
            {phase.kind === "uploading"
              ? messages.uploadingTemplate.replace("{pct}", String(phase.progressPct))
              : phase.kind === "creating"
                ? messages.creating
                : phase.kind === "from-url"
                  ? messages.fromUrl.loading
                  : messages.submit}
          </button>
        </section>

        {phase.kind === "done" && (
          <div className="document-result-placeholder" role="status">
            <p>{messages.resultPlaceholder.replace("{jobId}", phase.jobId)}</p>
            <code>{phase.jobId}</code>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="document-error" role="alert">
            <strong>{messages.errors.heading}</strong>
            <p>{phase.message}</p>
          </div>
        )}
      </div>
    </TranslateShell>
  )
}
