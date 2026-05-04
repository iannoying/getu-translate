import { captureEvent } from "./posthog"
import type { WorkerEnv } from "../env"

export type LogLevel = "info" | "warn" | "error"

export type LogContext = {
  env?: WorkerEnv
  /** Cloudflare ExecutionContext for fire-and-forget PostHog fan-out. */
  executionCtx?: ExecutionContext
  /**
   * Override PostHog forwarding for this call.
   * Default: error=true, warn=false, info=false.
   */
  forward?: boolean
}

function shouldForward(level: LogLevel, opts: LogContext): boolean {
  if (opts.forward !== undefined) return opts.forward
  return level === "error"
}

function emit(
  level: LogLevel,
  message: string,
  props: Record<string, unknown>,
  opts: LogContext = {},
): void {
  const consoleFn =
    level === "error" ? console.error : level === "warn" ? console.warn : console.info
  consoleFn(`[${level}]`, message, props)

  // Best-effort PostHog forward (only when env+ctx are present and key is configured).
  if (shouldForward(level, opts) && opts.env?.POSTHOG_PROJECT_KEY && opts.executionCtx) {
    opts.executionCtx.waitUntil(
      captureEvent({
        apiKey: opts.env.POSTHOG_PROJECT_KEY,
        distinctId: typeof props["userId"] === "string" ? props["userId"] : "system",
        event: "internal_log",
        properties: { level, message, ...props },
        host: opts.env.POSTHOG_HOST,
      }).catch(() => {
        // Swallow — PostHog must never break the worker.
      }),
    )
  }
}

export const logger = {
  info: (
    message: string,
    props: Record<string, unknown> = {},
    opts: LogContext = {},
  ): void => emit("info", message, props, opts),
  warn: (
    message: string,
    props: Record<string, unknown> = {},
    opts: LogContext = {},
  ): void => emit("warn", message, props, opts),
  error: (
    message: string,
    props: Record<string, unknown> = {},
    opts: LogContext = {},
  ): void => emit("error", message, props, opts),
}
