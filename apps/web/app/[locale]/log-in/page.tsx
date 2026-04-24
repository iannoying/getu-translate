"use client"

import { Suspense, use, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { PageHero, SiteShell } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8788"

type Mode = "signin" | "signup"
type Method = "password" | "code"
type Providers = {
  google: boolean
  github: boolean
  emailPassword?: boolean
  emailOtp?: boolean
  passkey?: boolean
}

const RESEND_COOLDOWN_SECONDS = 60

/** Same-origin redirect guard: must start with "/" but not "//" (prevents protocol-relative
 *  open-redirects like `//evil.com`). Falls back to the default when invalid or missing. */
function safeRedirect(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}

export default function LogInPage({ params }: { params: Promise<{ locale: string }> }) {
  // useSearchParams() bails out of static prerendering unless wrapped in a Suspense
  // boundary; Next.js 15 enforces this. Keep the actual page client logic in a child.
  return (
    <Suspense fallback={null}>
      <LogInPageInner params={params} />
    </Suspense>
  )
}

function LogInPageInner({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = use(params)
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  const searchParams = useSearchParams()
  const redirectTarget = safeRedirect(searchParams?.get("redirect") ?? null, `/${locale}/`)

  const [mode, setMode] = useState<Mode>("signin")
  const [method, setMethod] = useState<Method>("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [providers, setProviders] = useState<Providers>({ google: false, github: false })
  const passkeyConditionalStarted = useRef(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/identity/providers`, { credentials: "include" })
      .then(r => r.json())
      .then((data: Providers) => setProviders(data))
      .catch(() => setProviders({ google: false, github: false }))
  }, [])

  // Conditional UI: when the email field is focused/autofilled the browser surfaces
  // any registered passkey for this site. Safe to call even if no passkeys exist.
  useEffect(() => {
    if (passkeyConditionalStarted.current) return
    if (typeof window === "undefined") return
    const PKC = window.PublicKeyCredential as (typeof window.PublicKeyCredential & { isConditionalMediationAvailable?: () => Promise<boolean> }) | undefined
    if (!PKC || !PKC.isConditionalMediationAvailable) return
    PKC.isConditionalMediationAvailable().then((ok) => {
      if (!ok) return
      passkeyConditionalStarted.current = true
      void authClient.signIn.passkey({ autoFill: true }).then((res) => {
        if (res && !res.error) window.location.href = redirectTarget
      }).catch(() => {})
    }).catch(() => {})
  }, [redirectTarget])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  function resetMessages() {
    setError(null)
    setInfo(null)
  }

  async function handleSendCode() {
    resetMessages()
    if (!email) return
    setSendingCode(true)
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })
      if (res.error) {
        setError(res.error.message ?? t.auth.sendCodeFailed)
        return
      }
      setInfo(t.auth.codeSent)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.sendCodeFailed)
    } finally {
      setSendingCode(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({ email, password, name })
        if (res.error) {
          setError(res.error.message ?? t.errors.signUpFailed)
          return
        }
      } else if (method === "code") {
        const res = await authClient.signIn.emailOtp({ email, otp: code })
        if (res.error) {
          setError(res.error.message ?? t.errors.signInFailed)
          return
        }
      } else {
        const res = await authClient.signIn.email({ email, password })
        if (res.error) {
          setError(res.error.message ?? t.errors.signInFailed)
          return
        }
      }
      window.location.href = redirectTarget
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected)
    } finally {
      setLoading(false)
    }
  }

  async function handleSocial(provider: "google" | "github") {
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}${redirectTarget}`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected)
    }
  }

  const title = mode === "signin" ? t.auth.signInTitle : t.auth.signUpTitle
  const intro = mode === "signin" ? t.auth.signInIntro : t.auth.signUpIntro
  const submitLabel = mode === "signup" ? t.auth.submitSignUp : t.auth.submit
  const showMethodToggle = mode === "signin"
  const showPassword = mode === "signup" || method === "password"
  const showCode = mode === "signin" && method === "code"

  return (
    <SiteShell locale={locale} messages={t.common}>
      <PageHero eyebrow={t.auth.eyebrow} title={title}>
        <p>{intro}</p>
      </PageHero>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-mode-toggle" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "signin"}
              className={`toggle-btn${mode === "signin" ? " active" : ""}`}
              onClick={() => { setMode("signin"); resetMessages() }}
            >
              {t.auth.signInTab}
            </button>
            <button
              role="tab"
              aria-selected={mode === "signup"}
              className={`toggle-btn${mode === "signup" ? " active" : ""}`}
              onClick={() => { setMode("signup"); resetMessages() }}
            >
              {t.auth.signUpTab}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signup" && (
              <label className="auth-field">
                <span>{t.auth.name}</span>
                <input
                  type="text"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                  autoComplete="name"
                  placeholder={t.auth.namePlaceholder}
                />
              </label>
            )}
            <label className="auth-field">
              <span>{t.auth.email}</span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                autoComplete="email webauthn"
                placeholder={t.auth.emailPlaceholder}
              />
            </label>

            {showMethodToggle && (
              <div className="auth-method-toggle" role="tablist" aria-label="Sign-in method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={method === "password"}
                  className={`method-btn${method === "password" ? " active" : ""}`}
                  onClick={() => { setMethod("password"); resetMessages() }}
                >
                  {t.auth.methodPasswordTab}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={method === "code"}
                  className={`method-btn${method === "code" ? " active" : ""}`}
                  onClick={() => { setMethod("code"); resetMessages() }}
                >
                  {t.auth.methodCodeTab}
                </button>
              </div>
            )}

            {showPassword && (
              <label className="auth-field">
                <span>{t.auth.password}</span>
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required={showPassword}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? t.auth.newPasswordPlaceholder : t.auth.passwordPlaceholder}
                />
              </label>
            )}

            {showCode && (
              <label className="auth-field">
                <span>{t.auth.code}</span>
                <div className="auth-code-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={code}
                    onChange={event => setCode(event.target.value.replace(/\D/g, ""))}
                    required={showCode}
                    autoComplete="one-time-code"
                    placeholder={t.auth.codePlaceholder}
                  />
                  <button
                    type="button"
                    className="button secondary auth-send-code"
                    disabled={!email || sendingCode || cooldown > 0}
                    onClick={handleSendCode}
                  >
                    {sendingCode
                      ? t.auth.sendingCode
                      : cooldown > 0
                        ? t.auth.resendCodeIn.replace("{seconds}", String(cooldown))
                        : t.auth.sendCode}
                  </button>
                </div>
              </label>
            )}

            {info != null && <p className="auth-info" role="status">{info}</p>}
            {error != null && <p className="auth-error" role="alert">{error}</p>}

            <button type="submit" className="button primary auth-submit" disabled={loading}>
              {loading ? t.auth.submitLoading : submitLabel}
            </button>

            {mode === "signin" && method === "password" && (
              <p className="auth-forgot">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => { setMethod("code"); resetMessages() }}
                >
                  {t.auth.forgotPassword}
                </button>
              </p>
            )}
          </form>

          <div className="auth-or"><span>{t.auth.or}</span></div>

          <div className="auth-social">
            <div className="auth-social-btns">
              <button
                className="button secondary auth-social-btn"
                disabled={!providers.google || loading}
                onClick={() => providers.google && handleSocial("google")}
                title={providers.google ? t.auth.google : t.auth.googleComingSoon}
              >
                <GoogleIcon />
                {providers.google ? t.auth.google : t.auth.googleComingSoon}
              </button>
              <button
                className="button secondary auth-social-btn"
                disabled={!providers.github || loading}
                onClick={() => providers.github && handleSocial("github")}
                title={providers.github ? t.auth.github : t.auth.githubComingSoon}
              >
                <GitHubIcon />
                {providers.github ? t.auth.github : t.auth.githubComingSoon}
              </button>
            </div>
            <p className="auth-passkey-hint">{t.auth.passkeyHint}</p>
          </div>
        </div>
      </section>
    </SiteShell>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}
