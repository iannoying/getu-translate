"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import { orpcClient } from "@/lib/orpc-client"
import {
  TRANSLATE_MODELS,
  isFreeTranslateModel,
  type TranslateModelId,
} from "@getu/definitions"
import type { Entitlements } from "@getu/contract"
import type { Messages } from "@/lib/i18n/messages"
import { HistoryDrawer, type HistoryEntry } from "./components/HistoryDrawer"
import { LangPicker } from "./components/LangPicker"
import { ModelGrid } from "./components/ModelGrid"
import type { ModelCardState } from "./components/ModelCard"
import { QuotaBadge } from "./components/QuotaBadge"
import { TranslateShell } from "./components/TranslateShell"
import { UpgradeModal, type UpgradeModalSource } from "./components/UpgradeModal"
import { DEMO_INPUT, DEMO_RESULTS } from "./demo-data"
import { runColumnTranslations, type ColumnTask } from "./translate-orchestrator"

/**
 * Client-side i18n shape mirrors `Messages["translate"]` exactly. We avoid
 * embedding functions (e.g. precomputed format helpers) because Server
 * Components cannot serialize closures across the boundary; templates with
 * placeholders like `{used}` / `{limit}` are formatted at render time.
 */
export type TranslateMessages = Messages["translate"]

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  let out = template
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value))
  }
  return out
}

const FREE_CHAR_LIMIT = 2000
const PRO_CHAR_LIMIT = 20000

type Plan = "anonymous" | "free" | "pro" | "enterprise"

/**
 * Derives the plan tier from entitlements. Returns "anonymous" when the user
 * is not signed in — entitlements are only fetched for authed users.
 */
function planFromEntitlements(e: Entitlements | null): Plan {
  if (!e) return "anonymous"
  return e.tier
}

/**
 * Fires the pro_upgrade_triggered analytics event.
 * TODO: wire to real analytics (apps/api/src/analytics or a client-side sink)
 * once the analytics pipeline is implemented in M6.x.
 */
function trackUpgradeTriggered(source: UpgradeModalSource): void {
  // eslint-disable-next-line no-console -- TODO: replace with real analytics once M6.x analytics pipeline is wired
  console.info("pro_upgrade_triggered", { source })
}

function buildInitialResults(plan: Plan): Partial<Record<TranslateModelId, ModelCardState>> {
  const out: Partial<Record<TranslateModelId, ModelCardState>> = {}
  for (const model of TRANSLATE_MODELS) {
    if (plan === "anonymous") {
      out[model.id] = { status: "done", text: DEMO_RESULTS[model.id] }
    } else if (plan === "free" && !model.freeAvailable) {
      // Locked state — body will render upgrade CTA, no text needed.
      out[model.id] = { status: "idle" }
    } else {
      out[model.id] = { status: "done", text: DEMO_RESULTS[model.id] }
    }
  }
  return out
}

/** Models the user can actually invoke with their current plan. */
function visibleModelsForPlan(plan: Plan): TranslateModelId[] {
  if (plan === "free") {
    return TRANSLATE_MODELS.filter(m => isFreeTranslateModel(m.id)).map(m => m.id)
  }
  if (plan === "pro" || plan === "enterprise") {
    return TRANSLATE_MODELS.map(m => m.id)
  }
  return []
}

export function TranslateClient({
  locale,
  messages,
}: {
  locale: Locale
  messages: TranslateMessages
}) {
  const router = useRouter()
  const session = authClient.useSession()
  const isLoadingSession = session.isPending
  const isAuthed = !!session.data?.user

  // M6.7: real entitlements from billing.getEntitlements. Fetched once after
  // auth resolves; null while loading or when anonymous.
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)

  useEffect(() => {
    if (!isAuthed) {
      setEntitlements(null)
      return
    }
    let cancelled = false
    orpcClient.billing.getEntitlements({}).then((e) => {
      if (!cancelled) setEntitlements(e)
    }).catch((err) => {
      // Non-fatal — fall back to "free" tier so the page remains usable.
      // Mirror the cancel guard from the success branch / history fetch:
      // if the user logged out before this rejected, suppress console noise.
      if (cancelled) return
      // eslint-disable-next-line no-console -- helps M6.7 ops trace entitlement fetch failures
      console.warn("[translate] getEntitlements failed", err)
    })
    return () => { cancelled = true }
  }, [isAuthed])

  const plan: Plan = isAuthed ? planFromEntitlements(entitlements) : "anonymous"
  const charLimit = plan === "pro" || plan === "enterprise" ? PRO_CHAR_LIMIT : FREE_CHAR_LIMIT

  // Upgrade modal state
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeSource, setUpgradeSource] = useState<UpgradeModalSource | null>(null)

  function openUpgradeModal(source: UpgradeModalSource) {
    setUpgradeSource(source)
    setUpgradeOpen(true)
    trackUpgradeTriggered(source)
  }

  const [text, setText] = useState(plan === "anonymous" ? DEMO_INPUT : "")
  const [source, setSource] = useState("auto")
  const [target, setTarget] = useState("zh-CN")

  // Mutable results map — written by per-column orpc callbacks. Lazy
  // initializer keys off the *initial* plan; the useEffect below resets
  // when plan changes (anonymous → free transition after session resolves).
  const [results, setResults] = useState<Partial<Record<TranslateModelId, ModelCardState>>>(
    () => buildInitialResults(plan),
  )
  const [isTranslating, setIsTranslating] = useState(false)

  // AbortController ref — aborted on new translate click or on unmount so
  // in-flight orpc calls don't consume tokens after the component is gone.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // History state — fetched once after auth resolves, then mutated locally
  // by translate (prepend) / delete / clear so we don't refetch round-trip.
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    setResults(buildInitialResults(plan))
  }, [plan])

  useEffect(() => {
    // Anonymous users have no server-side history; rendering the drawer
    // empty is the expected behavior. Skip the API call entirely.
    if (!isAuthed) {
      setHistoryEntries([])
      return
    }
    let cancelled = false
    setHistoryLoading(true)
    orpcClient.translate
      .listHistory({ limit: 100 })
      .then((res) => {
        if (cancelled) return
        setHistoryEntries(res.items as HistoryEntry[])
      })
      .catch((err) => {
        if (cancelled) return
        // Non-fatal — drawer just shows the empty state.
        // eslint-disable-next-line no-console -- helps M6 ops trace history outages
        console.warn("[translate] history list failed", err)
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed])

  const charCount = text.length
  const overLimit = charCount > charLimit

  function handleSwap() {
    if (source === "auto") return
    setSource(target)
    setTarget(source)
  }

  async function handleTranslate() {
    if (!isAuthed) {
      router.push(localeHref(locale, "/log-in?redirect=/translate"))
      return
    }
    const trimmed = text.trim()
    if (trimmed.length === 0 || overLimit || isTranslating) return

    const modelsToFire = visibleModelsForPlan(plan)
    if (modelsToFire.length === 0) return

    // Abort any previous in-flight batch before starting a new one.
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    // One UUID per click — every concurrent column shares it so the server's
    // consumeQuota idempotency collapses N column calls to 1 decrement.
    const clickId = crypto.randomUUID()
    setIsTranslating(true)
    setResults(prev => {
      const next = { ...prev }
      for (const id of modelsToFire) next[id] = { status: "loading" }
      return next
    })

    const tasks: ColumnTask[] = modelsToFire.map((modelId) => ({
      modelId,
      run: (signal: AbortSignal) =>
        orpcClient.translate.translate(
          {
            text: trimmed,
            sourceLang: source,
            targetLang: target,
            modelId,
            columnId: `col-${modelId}`,
            clickId,
          },
          { signal },
        ),
    }))

    const columnResults = await runColumnTranslations(tasks, ac.signal)

    // If the component unmounted or a new translate was fired while we were
    // in-flight, ac.signal is now aborted — skip all state updates.
    if (ac.signal.aborted) return

    // Track per-column outcomes locally so we can save the complete row to
    // history at the end. We can't read the final React state synchronously
    // after the orchestrator resolves (setState is async), so this local map
    // is the source of truth for the saveHistory payload.
    const localResults: Record<string, { text: string } | { error: string }> = {}

    for (const result of columnResults) {
      if ("text" in result) {
        localResults[result.modelId] = { text: result.text }
        setResults(prev => ({ ...prev, [result.modelId]: { status: "done", text: result.text } }))
      } else {
        // Use the localized friendly fallback rather than the raw oRPC
        // error.message — that string can include upstream provider HTTP
        // bodies which are not user-friendly and may leak provider tracking
        // identifiers. M6.5b will key off err.data.code (PROVIDER_FAILED,
        // RATE_LIMITED, ...) for more specific UX, but for M6.5a the
        // generic message is correct and safe.
        // eslint-disable-next-line no-console -- helps M6.5b debug provider failures without surfacing them to users
        console.warn("[translate] column failed", result.modelId, result.error)
        localResults[result.modelId] = { error: result.error.message ?? result.error.code }
        setResults(prev => ({
          ...prev,
          [result.modelId]: { status: "error", errorMessage: messages.page.cardErrorFallback },
        }))
        // Open upgrade modal on quota-exceeded errors from the server.
        // oRPC surfaces the error code on err.data?.code (ORPCError shape).
        if (result.error.code === "QUOTA_EXCEEDED" || result.error.code === "INSUFFICIENT_QUOTA") {
          openUpgradeModal("free_quota_exceeded")
        }
      }
    }

    // Task 5 hook fires here (quota-badge refresh after translate completes)

    // Persist to history. We always save (even if every column failed) so
    // the user can see "I tried this on Tuesday and nothing worked" — this
    // is more debuggable than silently dropping. saveHistory failures are
    // non-fatal: the translation already happened, the history is bonus.
    try {
      const saved = await orpcClient.translate.saveHistory({
        sourceText: trimmed,
        sourceLang: source,
        targetLang: target,
        results: localResults,
      })
      setHistoryEntries(prev => [
        {
          id: saved.id,
          sourceText: trimmed,
          sourceLang: source,
          targetLang: target,
          results: localResults,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
    } catch (err) {
      // eslint-disable-next-line no-console -- non-fatal history persist failure
      console.warn("[translate] saveHistory failed", err)
    }

    setIsTranslating(false)
  }

  /** Restore a history entry into input + 11 cards. No API call, no quota. */
  const handleRestore = useCallback((entry: HistoryEntry) => {
    setText(entry.sourceText)
    setSource(entry.sourceLang)
    setTarget(entry.targetLang)
    setResults(() => {
      const next = buildInitialResults(plan)
      for (const [modelId, value] of Object.entries(entry.results)) {
        const id = modelId as TranslateModelId
        if ("text" in value) {
          next[id] = { status: "done", text: value.text }
        } else {
          next[id] = { status: "error", errorMessage: value.error }
        }
      }
      return next
    })
  }, [plan])

  const handleDeleteHistory = useCallback(async (id: string) => {
    // Optimistic remove. On failure we re-insert ONLY the removed row, not
    // the entire pre-call list — otherwise a concurrent translate that
    // prepended a new entry between the click and the failure would be
    // silently stomped by `setHistoryEntries(before)`.
    let removed: HistoryEntry | undefined
    setHistoryEntries((prev) => {
      const idx = prev.findIndex(e => e.id === id)
      if (idx === -1) return prev
      removed = prev[idx]
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
    try {
      await orpcClient.translate.deleteHistory({ id })
    } catch (err) {
      // eslint-disable-next-line no-console -- non-fatal; user can retry
      console.warn("[translate] deleteHistory failed", err)
      const r = removed
      if (!r) return
      setHistoryEntries((prev) => {
        // If something else (rare retry, server-push) put it back, leave alone.
        if (prev.some(e => e.id === r.id)) return prev
        return [r, ...prev]
      })
    }
  }, [])

  const handleClearHistory = useCallback(async () => {
    // Same rollback story as deleteHistory: snapshot the cleared rows in a
    // local var (NOT a captured `before` array) so a concurrent translate's
    // prepend during the failed clear isn't lost on rollback.
    let removed: HistoryEntry[] = []
    setHistoryEntries((prev) => {
      removed = prev
      return []
    })
    try {
      await orpcClient.translate.clearHistory({})
    } catch (err) {
      // eslint-disable-next-line no-console -- non-fatal; user can retry
      console.warn("[translate] clearHistory failed", err)
      const r = removed
      setHistoryEntries((prev) => {
        // Merge: keep any entries the user added during the in-flight clear,
        // re-add the cleared rows that aren't already back. Dedupe by id.
        const seenIds = new Set(prev.map(e => e.id))
        const restored = r.filter(e => !seenIds.has(e.id))
        return [...prev, ...restored]
      })
    }
  }, [])

  function handleUpgradeClick() {
    openUpgradeModal("pro_model_clicked")
  }

  const translateLabel = !isAuthed
    ? messages.page.translateLoginButton
    : isLoadingSession || isTranslating
      ? messages.page.translateLoadingButton
      : messages.page.translateButton

  return (
    <TranslateShell locale={locale} labels={messages.shell}>
      <UpgradeModal
        open={upgradeOpen}
        source={upgradeSource}
        onClose={() => setUpgradeOpen(false)}
        locale={locale}
        labels={messages.upgradeModal}
      />
      <div className="translate-page">
        {isAuthed && (
          <HistoryDrawer
            entries={historyEntries}
            loading={historyLoading}
            locale={locale}
            labels={messages.history}
            onRestore={handleRestore}
            onDelete={handleDeleteHistory}
            onClear={handleClearHistory}
          />
        )}
        <div className="translate-page-main">
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
            label={messages.page.quotaLabel}
            tooltipTemplate={messages.quotaBadge.tooltip}
          />
        </header>

        <div className="translate-body">
          <section className="translate-input-pane" aria-label="Input">
            <textarea
              className="translate-input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={messages.page.inputPlaceholder}
              rows={12}
              disabled={isTranslating}
            />
            <div className="translate-input-foot">
              <span className={`char-counter ${overLimit ? "char-counter-over" : charCount > charLimit * 0.8 ? "char-counter-warn" : ""}`}>
                {formatTemplate(messages.page.charCounterTemplate, { used: charCount, limit: charLimit })}
              </span>
              {overLimit && (
                <button
                  type="button"
                  className="char-counter-msg char-counter-msg-button"
                  onClick={() => openUpgradeModal("char_limit_exceeded")}
                >
                  {messages.page.charLimitExceeded}
                </button>
              )}
              <div className="translate-input-actions">
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => setText("")}
                  disabled={isTranslating}
                >
                  {messages.page.clearButton}
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleTranslate}
                  disabled={overLimit || isTranslating || (isAuthed && text.trim().length === 0)}
                >
                  {translateLabel}
                </button>
              </div>
            </div>
          </section>

          <section className="translate-output-pane" aria-label="Translations">
            <ModelGrid
              plan={plan}
              results={results}
              upgradeMessage={messages.page.upgradePromptShort}
              cardLabels={{
                upgradeButton: messages.shell.upgradePro,
                loading: messages.page.cardLoading,
                errorFallback: messages.page.cardErrorFallback,
              }}
              onUpgradeClick={handleUpgradeClick}
            />
          </section>
        </div>
        </div>
      </div>
    </TranslateShell>
  )
}
