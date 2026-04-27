"use client"

import type { ReactNode } from "react"
import { authClient } from "@/lib/auth-client"

export function AuthGate({
  children,
  fallback,
}: {
  children: ReactNode
  /** Optional custom fallback. Default: a small "Login to view" prompt. */
  fallback?: ReactNode
}) {
  const session = authClient.useSession()
  const isLoading = session.isPending
  const isAuthed = !!session.data?.user

  if (isLoading) {
    return <div className="auth-gate-loading" aria-hidden="true" />
  }

  if (!isAuthed) {
    return (
      <>
        {fallback ?? (
          <div className="auth-gate-prompt">
            <p>登录后查看完整内容</p>
            <a href="/log-in">登录</a>
          </div>
        )}
      </>
    )
  }

  return <>{children}</>
}
