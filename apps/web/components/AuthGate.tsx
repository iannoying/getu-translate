"use client"

import type { ReactNode } from "react"
import { authClient } from "@/lib/auth-client"

export function AuthGate({
  children,
  fallback,
}: {
  children: ReactNode
  /** Required locale-aware fallback shown when the user is not authenticated. */
  fallback: ReactNode
}) {
  const session = authClient.useSession()
  const isLoading = session.isPending
  const isAuthed = !!session.data?.user

  if (isLoading) {
    return <div className="auth-gate-loading" aria-hidden="true" />
  }

  if (!isAuthed) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
