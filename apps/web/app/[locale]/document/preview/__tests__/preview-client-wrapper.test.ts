import { describe, expect, it } from "vitest"
import { normalizePreviewJobId } from "../preview-routing"

describe("normalizePreviewJobId", () => {
  it("removes trailing slashes introduced by old preview URLs", () => {
    expect(normalizePreviewJobId("11dc8379-bdae-4d69-a9d0-d23301313e96/")).toBe(
      "11dc8379-bdae-4d69-a9d0-d23301313e96",
    )
    expect(normalizePreviewJobId("11dc8379-bdae-4d69-a9d0-d23301313e96///")).toBe(
      "11dc8379-bdae-4d69-a9d0-d23301313e96",
    )
  })

  it("leaves normal job ids unchanged", () => {
    expect(normalizePreviewJobId("11dc8379-bdae-4d69-a9d0-d23301313e96")).toBe(
      "11dc8379-bdae-4d69-a9d0-d23301313e96",
    )
  })
})
