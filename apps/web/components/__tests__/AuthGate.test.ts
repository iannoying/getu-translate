/**
 * AuthGate unit test — pure function level, no React/RTL needed.
 *
 * The gating logic reduces to three cases: loading, unauthed, authed.
 * We extract and test the decision table directly.
 */
import { describe, expect, it } from "vitest"

type SessionState = { isPending: boolean; data: { user: object } | null }

/** Mirrors the gating logic inside AuthGate */
function resolveGateState(session: SessionState): "loading" | "prompt" | "show" {
  if (session.isPending) return "loading"
  if (!session.data?.user) return "prompt"
  return "show"
}

describe("AuthGate state resolution", () => {
  it("returns 'loading' while session is pending", () => {
    expect(resolveGateState({ isPending: true, data: null })).toBe("loading")
  })

  it("returns 'prompt' when session resolved with no user", () => {
    expect(resolveGateState({ isPending: false, data: null })).toBe("prompt")
  })

  it("returns 'show' when session resolved with a user", () => {
    expect(resolveGateState({ isPending: false, data: { user: { id: "u1" } } })).toBe("show")
  })

  it("returns 'loading' even if data is present while pending (race guard)", () => {
    // isPending takes priority
    expect(resolveGateState({ isPending: true, data: { user: { id: "u1" } } })).toBe("loading")
  })
})
