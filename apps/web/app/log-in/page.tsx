"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"

export default function LogInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authClient.signIn.email({ email, password })
      if (res.error) {
        setError(res.error.message ?? "Sign in failed")
        return
      }
      window.location.href = "/"
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 420 }}>
      <h1>Log In</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button type="submit" disabled={loading}>{loading ? "..." : "Sign in"}</button>
        {error != null && <p style={{ color: "crimson" }} role="alert">{error}</p>}
      </form>
      <p style={{ marginTop: 24, color: "#666" }}>Sign-up UI arrives in Phase 4. For now create accounts via the better-auth API.</p>
    </main>
  )
}
