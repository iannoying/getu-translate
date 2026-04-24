import { describe, expect, it } from "vitest"
import { wordsToCSV } from "../words-csv"

const SAMPLE = [
  {
    id: 1,
    word: "ephemeral",
    context: "An ephemeral moment.",
    sourceUrl: "https://example.com",
    translation: "短暂的",
    interval: 3,
    repetitions: 1,
    nextReviewAt: new Date("2026-05-04T00:00:00Z"),
    createdAt: new Date("2026-05-01T00:00:00Z"),
  },
  {
    id: 2,
    word: "word with, comma",
    context: "context with \"quotes\"",
    sourceUrl: "https://example.com",
    translation: undefined,
    interval: 1,
    repetitions: 0,
    nextReviewAt: new Date("2026-05-02T00:00:00Z"),
    createdAt: new Date("2026-05-01T00:00:00Z"),
  },
]

describe("wordsToCSV", () => {
  it("includes a header row", () => {
    const csv = wordsToCSV(SAMPLE as never)
    const lines = csv.split("\n")
    expect(lines[0]).toBe("word,context,translation,interval,repetitions,nextReviewAt")
  })

  it("has one data row per word", () => {
    const csv = wordsToCSV(SAMPLE as never)
    const lines = csv.split("\n").filter(Boolean)
    expect(lines).toHaveLength(3)
  })

  it("quotes fields containing commas", () => {
    const csv = wordsToCSV(SAMPLE as never)
    expect(csv).toContain("\"word with, comma\"")
  })

  it("escapes double quotes by doubling them", () => {
    const csv = wordsToCSV(SAMPLE as never)
    expect(csv).toContain("\"\"quotes\"\"")
  })

  it("leaves empty string for undefined translation", () => {
    const csv = wordsToCSV(SAMPLE as never)
    const lines = csv.split("\n")
    expect(lines[2]).toMatch(/^"word with, comma"/)
    const fields = lines[2].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    expect(fields[2]).toBe("")
  })
})
