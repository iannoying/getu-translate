import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { textTranslations, translationJobs } from "../translate"

describe("text_translations schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(getTableColumns(textTranslations))
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "sourceText",
        "sourceLang",
        "targetLang",
        "results",
        "createdAt",
        "expiresAt",
      ]),
    )
  })

  it("results column is text (JSON-serialized record)", () => {
    const col = getTableColumns(textTranslations).results
    expect(col.dataType).toBe("string")
    expect(col.notNull).toBe(true)
  })

  it("expiresAt is nullable (Pro = retain forever)", () => {
    expect(getTableColumns(textTranslations).expiresAt.notNull).toBe(false)
  })
})

describe("translation_jobs schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(getTableColumns(translationJobs))
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "sourceKey",
        "sourcePages",
        "sourceFilename",
        "sourceBytes",
        "outputHtmlKey",
        "outputMdKey",
        "modelId",
        "sourceLang",
        "targetLang",
        "status",
        "engine",
        "progress",
        "progressUpdatedAt",
        "errorMessage",
        "createdAt",
        "expiresAt",
      ]),
    )
  })

  it("status defaults to 'queued' and is non-null", () => {
    const col = getTableColumns(translationJobs).status
    expect(col.notNull).toBe(true)
    expect(col.default).toBe("queued")
  })

  it("engine defaults to 'simple' and is non-null (babeldoc reserved for Phase A)", () => {
    const col = getTableColumns(translationJobs).engine
    expect(col.notNull).toBe(true)
    expect(col.default).toBe("simple")
  })

  it("expiresAt is required (every PDF has a retention deadline)", () => {
    expect(getTableColumns(translationJobs).expiresAt.notNull).toBe(true)
  })

  it("progressUpdatedAt is nullable (legacy rows may not have a progress heartbeat)", () => {
    const col = getTableColumns(translationJobs).progressUpdatedAt
    expect(col.dataType).toBe("date")
    expect(col.notNull).toBe(false)
  })

  it("output keys are nullable (filled only after successful pipeline)", () => {
    const cols = getTableColumns(translationJobs)
    expect(cols.outputHtmlKey.notNull).toBe(false)
    expect(cols.outputMdKey.notNull).toBe(false)
  })
})
