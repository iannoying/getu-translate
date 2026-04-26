"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { localeHref } from "@/lib/i18n/routing"
import type { Locale } from "@/lib/i18n/locales"
import { TRANSLATE_MODELS, type TranslateModelId } from "@getu/definitions"
import type { Messages } from "@/lib/i18n/messages"
import { LangPicker } from "./components/LangPicker"
import { ModelGrid } from "./components/ModelGrid"
import type { ModelCardState } from "./components/ModelCard"
import { QuotaBadge } from "./components/QuotaBadge"
import { TranslateShell } from "./components/TranslateShell"
import { DEMO_INPUT, DEMO_RESULTS } from "./demo-data"

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

function buildInitialResults(plan: "anonymous" | "free" | "pro" | "enterprise"): Partial<Record<TranslateModelId, ModelCardState>> {
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
  // M6.4: tier resolution from entitlements lands in M6.7. For now everyone
  // signed-in is treated as "free". Pro UI is exercised via the locked Pro
  // model cards and the upgrade CTAs.
  const plan: "anonymous" | "free" | "pro" | "enterprise" = !isAuthed ? "anonymous" : "free"
  const charLimit = plan === "free" ? FREE_CHAR_LIMIT : PRO_CHAR_LIMIT

  const [text, setText] = useState(plan === "anonymous" ? DEMO_INPUT : "")
  const [source, setSource] = useState("auto")
  const [target, setTarget] = useState("zh-CN")
  const initialResults = useMemo(() => buildInitialResults(plan), [plan])
  const [results] = useState(initialResults)

  const charCount = text.length
  const overLimit = charCount > charLimit

  function handleSwap() {
    if (source === "auto") return
    setSource(target)
    setTarget(source)
  }

  function handleTranslate() {
    if (!isAuthed) {
      router.push(localeHref(locale, "/log-in?next=/translate"))
      return
    }
    // M6.5 wires the real procedure; for M6.4 just show a toast hint.
    if (typeof window !== "undefined") {
      window.alert(messages.page.notImplementedToast)
    }
  }

  function handleUpgradeClick() {
    router.push(localeHref(locale, "/upgrade"))
  }

  const translateLabel = !isAuthed
    ? messages.page.translateLoginButton
    : isLoadingSession
      ? messages.page.translateLoadingButton
      : messages.page.translateButton

  return (
    <TranslateShell locale={locale} labels={messages.shell}>
      <div className="translate-page">
        <header className="translate-toolbar">
          <LangPicker
            source={source}
            target={target}
            onSourceChange={setSource}
            onTargetChange={setTarget}
            onSwap={handleSwap}
          />
          <div className="translate-toolbar-spacer" />
          <QuotaBadge used={0} limit={plan === "free" ? 100 : null} label={messages.page.quotaLabel} />
        </header>

        <div className="translate-body">
          <section className="translate-input-pane" aria-label="Input">
            <textarea
              className="translate-input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={messages.page.inputPlaceholder}
              rows={12}
            />
            <div className="translate-input-foot">
              <span className={`char-counter ${overLimit ? "char-counter-over" : charCount > charLimit * 0.8 ? "char-counter-warn" : ""}`}>
                {formatTemplate(messages.page.charCounterTemplate, { used: charCount, limit: charLimit })}
              </span>
              {overLimit && <span className="char-counter-msg">{messages.page.charLimitExceeded}</span>}
              <div className="translate-input-actions">
                <button type="button" className="button secondary small" onClick={() => setText("")}>
                  {messages.page.clearButton}
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleTranslate}
                  disabled={overLimit || (isAuthed && text.trim().length === 0)}
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
              onUpgradeClick={handleUpgradeClick}
            />
          </section>
        </div>
      </div>
    </TranslateShell>
  )
}
