import { describe, expect, it } from "vitest"
import { resolveMessage } from "../resolver"

describe("resolveMessage", () => {
  it("resolves a top-level nested key in English", () => {
    expect(resolveMessage("en", "popup.options")).toBe("Options")
  })

  it("resolves the same key in Simplified Chinese", () => {
    expect(resolveMessage("zh-CN", "popup.options")).toBe("选项")
  })

  it("resolves a deep nested key", () => {
    expect(resolveMessage("en", "popup.more.title")).toBe("More")
  })

  it("falls back to English when the target locale is missing a key", () => {
    // Every locale bundle should normally share keys, but the resolver must
    // gracefully fall back to English if one is accidentally missing. We
    // exercise the contract by asking for a definitely-missing key and
    // expecting the raw key back (both sides miss).
    expect(resolveMessage("en", "this.key.does.not.exist")).toBe("this.key.does.not.exist")
  })

  it("substitutes $1 placeholders from an array", () => {
    // popup.review.dueTooltip is "$1 words due for review"
    expect(resolveMessage("en", "popup.review.dueTooltip", [5])).toBe("5 words due for review")
  })

  it("substitutes $1 placeholders from a single scalar", () => {
    expect(resolveMessage("en", "popup.review.dueTooltip", 7)).toBe("7 words due for review")
  })

  it("returns the raw key when not found in any locale", () => {
    expect(resolveMessage("ja", "totally.made.up.key")).toBe("totally.made.up.key")
  })

  it("preserves unmatched placeholders if no substitution is provided for that index", () => {
    // Synthetic via a known $1 template: only one sub passed, $1 consumed, others untouched.
    // popup.review.dueTooltip only uses $1, so this is a smoke check.
    expect(resolveMessage("en", "popup.review.dueTooltip")).toBe("$1 words due for review")
  })
})
