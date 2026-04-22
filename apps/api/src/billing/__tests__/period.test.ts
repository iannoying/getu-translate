import { describe, expect, it } from "vitest"
import { periodKey, periodResetIso } from "../period"

describe("periodKey", () => {
  const fixed = new Date("2026-04-22T15:03:00.000Z")

  it("daily → YYYY-MM-DD UTC", () => {
    expect(periodKey("input_translate_daily", fixed)).toBe("2026-04-22")
    expect(periodKey("pdf_translate_daily", fixed)).toBe("2026-04-22")
  })

  it("monthly → YYYY-MM UTC", () => {
    expect(periodKey("ai_translate_monthly", fixed)).toBe("2026-04")
  })

  it("lifetime → 'lifetime'", () => {
    expect(periodKey("vocab_count", fixed)).toBe("lifetime")
  })
})

describe("periodResetIso", () => {
  it("daily → next UTC midnight", () => {
    expect(periodResetIso("input_translate_daily", new Date("2026-04-22T15:03:00.000Z"))).toBe("2026-04-23T00:00:00.000Z")
  })

  it("monthly → first of next month UTC", () => {
    expect(periodResetIso("ai_translate_monthly", new Date("2026-04-22T15:03:00.000Z"))).toBe("2026-05-01T00:00:00.000Z")
  })

  it("monthly crossing year boundary", () => {
    expect(periodResetIso("ai_translate_monthly", new Date("2026-12-31T23:59:00.000Z"))).toBe("2027-01-01T00:00:00.000Z")
  })

  it("lifetime → null", () => {
    expect(periodResetIso("vocab_count", new Date())).toBeNull()
  })
})
