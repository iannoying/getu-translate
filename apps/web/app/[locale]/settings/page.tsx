"use client"

import { use, useCallback, useEffect, useState } from "react"
import { authClient } from "@/lib/auth-client"
import { PageHero, SiteShell } from "@/app/components"
import { getMessages } from "@/lib/i18n/messages"
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales"

type Passkey = {
  id: string
  name?: string | null
  createdAt?: string | Date | null
  deviceType?: string | null
}

export default function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = use(params)
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en"
  const t = getMessages(locale)
  const session = authClient.useSession()

  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const supportsPasskey = typeof window !== "undefined"
    && typeof window.PublicKeyCredential !== "undefined"

  const refreshPasskeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authClient.passkey.listUserPasskeys()
      const data = (res.data ?? []) as Passkey[]
      setPasskeys(data)
    } catch {
      // Unauthenticated or transient error; leave list empty.
      setPasskeys([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session.data?.user) refreshPasskeys()
  }, [session.data?.user, refreshPasskeys])

  async function handleAdd() {
    setError(null)
    setInfo(null)
    setAdding(true)
    try {
      const res = await authClient.passkey.addPasskey({
        authenticatorAttachment: "platform",
      })
      if (res?.error) {
        setError(res.error.message ?? t.settings.passkeyAddFailed)
        return
      }
      setInfo(t.settings.passkeyAdded)
      await refreshPasskeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.passkeyAddFailed)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    setInfo(null)
    setRemovingId(id)
    try {
      const res = await authClient.passkey.deletePasskey({ id })
      if (res?.error) {
        setError(res.error.message ?? t.settings.passkeyRemoveFailed)
        return
      }
      await refreshPasskeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.passkeyRemoveFailed)
    } finally {
      setRemovingId(null)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    window.location.href = `/${locale}/log-in`
  }

  // Loading session — show a minimal placeholder so layout doesn't flash.
  if (session.isPending) {
    return (
      <SiteShell locale={locale} messages={t.common}>
        <PageHero eyebrow={t.settings.eyebrow} title={t.settings.title}>
          <p>{t.settings.intro}</p>
        </PageHero>
      </SiteShell>
    )
  }

  if (!session.data?.user) {
    return (
      <SiteShell locale={locale} messages={t.common}>
        <PageHero eyebrow={t.settings.eyebrow} title={t.settings.title}>
          <p>{t.settings.requireSignIn}</p>
          <p>
            <a className="button primary" href={`/${locale}/log-in`}>{t.settings.goToLogIn}</a>
          </p>
        </PageHero>
      </SiteShell>
    )
  }

  return (
    <SiteShell locale={locale} messages={t.common}>
      <PageHero eyebrow={t.settings.eyebrow} title={t.settings.title}>
        <p>{t.settings.intro}</p>
      </PageHero>

      <section className="settings-card-wrap">
        <div className="settings-card">
          <header className="settings-row">
            <div>
              <p className="muted">{t.settings.signedInAs}</p>
              <p className="settings-email">{session.data.user.email}</p>
            </div>
            <button className="button secondary" onClick={handleSignOut}>{t.settings.signOut}</button>
          </header>
        </div>

        <div className="settings-card">
          <h2>{t.settings.passkeysTitle}</h2>
          <p className="muted">{t.settings.passkeysIntro}</p>

          {!supportsPasskey && <p className="auth-error">{t.settings.unsupported}</p>}

          {info != null && <p className="auth-info" role="status">{info}</p>}
          {error != null && <p className="auth-error" role="alert">{error}</p>}

          {loading ? (
            <p className="muted">…</p>
          ) : passkeys.length === 0 ? (
            <p className="muted">{t.settings.noPasskeys}</p>
          ) : (
            <ul className="passkey-list">
              {passkeys.map((p) => (
                <li key={p.id} className="passkey-item">
                  <div>
                    <p className="passkey-name">{p.name ?? p.deviceType ?? "Passkey"}</p>
                    {p.createdAt && (
                      <p className="muted small">{t.settings.created}: {formatDate(p.createdAt, locale)}</p>
                    )}
                  </div>
                  <button
                    className="button secondary"
                    disabled={removingId === p.id}
                    onClick={() => handleDelete(p.id)}
                  >
                    {removingId === p.id ? t.settings.removing : t.settings.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            className="button primary"
            disabled={!supportsPasskey || adding}
            onClick={handleAdd}
          >
            {adding ? t.settings.adding : t.settings.addPasskey}
          </button>
        </div>
      </section>
    </SiteShell>
  )
}

function formatDate(value: string | Date, locale: Locale): string {
  try {
    const d = typeof value === "string" ? new Date(value) : value
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return String(value)
  }
}
