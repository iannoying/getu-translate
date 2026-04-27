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
