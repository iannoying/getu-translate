import { describe, expect, it } from "vitest"
import { groupSegmentsByPage, parseSegmentsFile } from "../segments"

const validFile = {
  jobId: "j1",
  modelId: "google",
  sourceLang: "en",
  targetLang: "zh-CN",
  generatedAt: "2026-05-09T00:00:00.000Z",
  segments: [
    { index: 1, source: "A", translation: "甲", startPage: 2, endPage: 2, modelId: "google" },
    { index: 0, source: "B", translation: "乙", startPage: 1, endPage: 1, modelId: "google" },
    { index: 2, source: "C", translation: "丙", startPage: 2, endPage: 3, modelId: "google" },
  ],
}

describe("parseSegmentsFile", () => {
  it("accepts the queue segments file shape", () => {
    expect(parseSegmentsFile(validFile).jobId).toBe("j1")
  })

  it("rejects malformed segment payloads", () => {
    expect(() => parseSegmentsFile({ segments: "bad" })).toThrow("Invalid segments file")
  })

  it("rejects invalid segment numeric fields", () => {
    expect(() => parseSegmentsFile({
      ...validFile,
      segments: [{ ...validFile.segments[0], startPage: 0 }],
    })).toThrow("Invalid segments file")

    expect(() => parseSegmentsFile({
      ...validFile,
      segments: [{ ...validFile.segments[0], index: 1.5 }],
    })).toThrow("Invalid segments file")

    expect(() => parseSegmentsFile({
      ...validFile,
      segments: [{ ...validFile.segments[0], startPage: Number.NaN }],
    })).toThrow("Invalid segments file")

    expect(() => parseSegmentsFile({
      ...validFile,
      segments: [{ ...validFile.segments[0], endPage: 1 }],
    })).toThrow("Invalid segments file")
  })
})

describe("groupSegmentsByPage", () => {
  it("groups by startPage and sorts by segment index", () => {
    const grouped = groupSegmentsByPage(parseSegmentsFile(validFile), 3)
    expect(grouped).toEqual([
      { page: 1, segments: [validFile.segments[1]] },
      { page: 2, segments: [validFile.segments[0], validFile.segments[2]] },
      { page: 3, segments: [] },
    ])
  })
})
