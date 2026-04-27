import { describe, it, expect } from "vitest"
import {
  applyStatusPayload,
  isTerminal,
  type PreviewState,
  type StatusPayload,
} from "../preview-state"

const queued: StatusPayload = {
  status: "queued",
  progress: null,
  outputHtmlKey: null,
  outputMdKey: null,
  errorMessage: null,
}

const processing: StatusPayload = {
  status: "processing",
  progress: { stage: "translating", pct: 50 },
  outputHtmlKey: null,
  outputMdKey: null,
  errorMessage: null,
}

const done: StatusPayload = {
  status: "done",
  progress: null,
  outputHtmlKey: "out/job123/index.html",
  outputMdKey: "out/job123/index.md",
  errorMessage: null,
}

const failed: StatusPayload = {
  status: "failed",
  progress: null,
  outputHtmlKey: null,
  outputMdKey: null,
  errorMessage: "Worker crashed",
}

describe("preview state transitions", () => {
  it("starts in loading", () => {
    const initial: PreviewState = { kind: "loading" }
    expect(initial.kind).toBe("loading")
  })

  it("transitions loading → polling on first queued status response", () => {
    const initial: PreviewState = { kind: "loading" }
    const next = applyStatusPayload(initial, queued)
    expect(next.kind).toBe("polling")
    if (next.kind === "polling") {
      expect(next.status).toBe("queued")
      expect(next.progress).toBeNull()
      expect(next.pollCount).toBe(1)
    }
  })

  it("transitions loading → polling on first processing status response", () => {
    const initial: PreviewState = { kind: "loading" }
    const next = applyStatusPayload(initial, processing)
    expect(next.kind).toBe("polling")
    if (next.kind === "polling") {
      expect(next.status).toBe("processing")
      expect(next.progress).toEqual({ stage: "translating", pct: 50 })
      expect(next.pollCount).toBe(1)
    }
  })

  it("increments pollCount on each polling response", () => {
    const initial: PreviewState = { kind: "loading" }
    const s1 = applyStatusPayload(initial, queued)
    const s2 = applyStatusPayload(s1, queued)
    const s3 = applyStatusPayload(s2, processing)
    expect(s1.kind === "polling" && s1.pollCount).toBe(1)
    expect(s2.kind === "polling" && s2.pollCount).toBe(2)
    expect(s3.kind === "polling" && s3.pollCount).toBe(3)
  })

  it("transitions polling → done when status=done", () => {
    const polling: PreviewState = {
      kind: "polling",
      status: "queued",
      progress: null,
      pollCount: 3,
    }
    const next = applyStatusPayload(polling, done)
    expect(next.kind).toBe("done")
    if (next.kind === "done") {
      expect(next.outputHtmlKey).toBe("out/job123/index.html")
      expect(next.outputMdKey).toBe("out/job123/index.md")
    }
  })

  it("transitions polling → failed when status=failed", () => {
    const polling: PreviewState = {
      kind: "polling",
      status: "processing",
      progress: null,
      pollCount: 2,
    }
    const next = applyStatusPayload(polling, failed)
    expect(next.kind).toBe("failed")
    if (next.kind === "failed") {
      expect(next.errorMessage).toBe("Worker crashed")
    }
  })

  it("transitions loading → done directly when status=done (immediate completion)", () => {
    const initial: PreviewState = { kind: "loading" }
    const next = applyStatusPayload(initial, done)
    expect(next.kind).toBe("done")
  })

  it("transitions polling → timeout (manual assignment)", () => {
    // timeout is set by the polling loop itself (not via applyStatusPayload),
    // but we verify the shape and isTerminal classification.
    const timeoutState: PreviewState = { kind: "timeout" }
    expect(isTerminal(timeoutState)).toBe(true)
  })

  it("ignores polling responses after abort — isTerminal prevents re-entry", () => {
    const doneState: PreviewState = {
      kind: "done",
      outputHtmlKey: "a.html",
      outputMdKey: "a.md",
    }
    // Caller checks isTerminal before calling applyStatusPayload.
    // Once terminal, polling should not re-apply.
    expect(isTerminal(doneState)).toBe(true)
    // If accidentally called, it would produce a new state — but the guard
    // prevents this in the real polling loop.
    const accidentally = applyStatusPayload(doneState, queued)
    // After an accidental call the state would be polling again;
    // the test just documents the guard must exist in the caller.
    expect(accidentally.kind).toBe("polling")
  })

  it("isTerminal returns false for loading", () => {
    expect(isTerminal({ kind: "loading" })).toBe(false)
  })

  it("isTerminal returns false for polling", () => {
    expect(
      isTerminal({ kind: "polling", status: "queued", progress: null, pollCount: 1 }),
    ).toBe(false)
  })

  it("isTerminal returns true for done", () => {
    expect(isTerminal({ kind: "done", outputHtmlKey: "x.html", outputMdKey: "x.md" })).toBe(true)
  })

  it("isTerminal returns true for failed", () => {
    expect(isTerminal({ kind: "failed", errorMessage: "err" })).toBe(true)
  })

  it("failed state uses fallback message when errorMessage is null", () => {
    const noMsg: StatusPayload = { ...failed, errorMessage: null }
    const next = applyStatusPayload({ kind: "loading" }, noMsg)
    expect(next.kind).toBe("failed")
    if (next.kind === "failed") {
      expect(next.errorMessage).toBe("Translation failed")
    }
  })
})
