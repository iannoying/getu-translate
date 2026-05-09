import { describe, expect, it } from "vitest"
import {
  buildDocumentOutputKeys,
  buildSegmentsKey,
  getPdfJobBasePrefix,
} from "../document-keys"

describe("document key helpers", () => {
  it("builds a per-job base prefix", () => {
    expect(getPdfJobBasePrefix("u1", "job2")).toBe("pdfs/u1/job2")
  })

  it("builds per-job output keys from the processing job id", () => {
    expect(buildDocumentOutputKeys("u1", "job2")).toEqual({
      segmentsKey: "pdfs/u1/job2/segments.json",
      htmlKey: "pdfs/u1/job2/output.html",
      mdKey: "pdfs/u1/job2/output.md",
    })
  })

  it("keeps buildSegmentsKey available for cleanup call sites", () => {
    expect(buildSegmentsKey("u1", "job3")).toBe("pdfs/u1/job3/segments.json")
  })
})
