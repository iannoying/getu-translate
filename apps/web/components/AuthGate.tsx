"use client"

import type { ReactNode } from "react"
import { authClient } from "@/lib/auth-client"

type RequiredFallback = Exclude<ReactNode, undefined>

export function AuthGate({
  children,
  fallback,
}: {
  children: ReactNode
  /** Required locale-aware fallback shown when the user is not authenticated. */
  fallback: RequiredFallback
}) {
  if (fallback === undefined) {
    throw new Error("AuthGate requires an explicit locale-aware fallback prop")
  }

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
