/**
 * Pure state-machine types and transition helpers for the document preview
 * polling loop.  Kept in a separate file so the logic can be unit-tested
 * without React / jsdom.
 */

export type PreviewProgress = {
  stage: string
  pct: number
}

export type PreviewState =
  | { kind: "loading" }
  | {
      kind: "polling"
      status: "queued" | "processing"
      progress: PreviewProgress | null
      pollCount: number
    }
  | { kind: "done"; outputHtmlKey: string; outputMdKey: string }
  | { kind: "failed"; errorMessage: string }
  | { kind: "timeout" }

export type StatusPayload = {
  status: "queued" | "processing" | "done" | "failed"
  progress: PreviewProgress | null
  outputHtmlKey: string | null
  outputMdKey: string | null
  errorMessage: string | null
}

export type PreviewErrorLabels = {
  authRequired: string
  notFound: string
  forbidden: string
}

/**
 * Compute the next PreviewState given the current state and a freshly-fetched
 * status payload.  Pure function — no side-effects.
 */
export function applyStatusPayload(
  current: PreviewState,
  payload: StatusPayload,
): PreviewState {
  const pollCount =
    current.kind === "polling" ? current.pollCount + 1 : 1

  switch (payload.status) {
    case "queued":
    case "processing":
      return {
        kind: "polling",
        status: payload.status,
        progress: payload.progress,
        pollCount,
      }
    case "done":
      return {
        kind: "done",
        outputHtmlKey: payload.outputHtmlKey ?? "",
        outputMdKey: payload.outputMdKey ?? "",
      }
    case "failed":
      return {
        kind: "failed",
        errorMessage: payload.errorMessage ?? "Translation failed",
      }
  }
}

/**
 * Returns true when the state is terminal (polling should stop).
 */
export function isTerminal(state: PreviewState): boolean {
  return (
    state.kind === "done" ||
    state.kind === "failed" ||
    state.kind === "timeout"
  )
}

function readErrorField(err: unknown, key: "code" | "status"): unknown {
  if (!err || typeof err !== "object") return undefined
  const obj = err as Record<string, unknown>
  return obj[key]
    ?? (obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)[key]
      : undefined)
    ?? (obj.error && typeof obj.error === "object"
      ? (obj.error as Record<string, unknown>)[key]
      : undefined)
}

export function statusErrorToPreviewState(
  err: unknown,
  labels: PreviewErrorLabels,
): PreviewState | null {
  const status = readErrorField(err, "status")
  const code = readErrorField(err, "code")
  if (status === 401 || code === "UNAUTHORIZED") {
    return { kind: "failed", errorMessage: labels.authRequired }
  }
  if (status === 403 || code === "FORBIDDEN") {
    return { kind: "failed", errorMessage: labels.forbidden }
  }
  if (status === 404 || code === "NOT_FOUND") {
    return { kind: "failed", errorMessage: labels.notFound }
  }
  return null
}
