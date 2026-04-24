import { createStore } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { mergeWithArrayOverwrite, writeConfigAtom } from "../config"
import { storageAdapter } from "../storage-adapter"

describe("mergeWithArrayOverwrite", () => {
  it("should overwrite arrays and merge objects in complex config scenarios", () => {
    const config = {
      language: DEFAULT_CONFIG.language,
      translate: {
        ...DEFAULT_CONFIG.translate,
        page: {
          ...DEFAULT_CONFIG.translate.page,
          autoTranslatePatterns: ["old.com"],
          autoTranslateLanguages: ["eng"],
        },
      },
      floatingButton: {
        ...DEFAULT_CONFIG.floatingButton,
        disabledFloatingButtonPatterns: ["gmail.com"],
      },
    }

    const patch = {
      language: { targetCode: "jpn" },
      translate: {
        page: {
          autoTranslatePatterns: ["new.com", "test.org"],
          autoTranslateLanguages: [],
        },
        mode: "replace",
      },
      floatingButton: {
        disabledFloatingButtonPatterns: ["youtube.com"],
      },
    }

    const result = mergeWithArrayOverwrite(config, patch)

    // Arrays should be completely replaced
    expect(result.translate.page.autoTranslatePatterns).toEqual(["new.com", "test.org"])
    expect(result.translate.page.autoTranslateLanguages).toEqual([])
    expect(result.floatingButton.disabledFloatingButtonPatterns).toEqual(["youtube.com"])

    expect(result.translate.mode).toBe("replace")
    expect(result.floatingButton.enabled).toBe(true)

    // Ensure immutability
    expect(result).not.toBe(config)
    expect(result.translate.page.autoTranslatePatterns).not.toBe(config.translate.page.autoTranslatePatterns)
  })

  it("should handle edge cases and type conversions", () => {
    // Array to non-array conversion
    expect(mergeWithArrayOverwrite({ arr: [1, 2] }, { arr: "string" })).toEqual({ arr: "string" })

    // Non-array to array conversion
    expect(mergeWithArrayOverwrite({ val: "text" }, { val: ["a", "b"] })).toEqual({ val: ["a", "b"] })

    // Empty array overwrite
    expect(mergeWithArrayOverwrite({ items: ["x"] }, { items: [] })).toEqual({ items: [] })

    // Null/undefined handling
    expect(mergeWithArrayOverwrite({ a: null }, { a: 1, b: undefined })).toEqual({ a: 1, b: undefined })
  })
})

describe("writeConfigAtom invalidated-context handling", () => {
  afterEach(() => vi.restoreAllMocks())

  it("does not re-throw when storage.set rejects with 'Extension context invalidated'", async () => {
    vi.spyOn(storageAdapter, "get").mockResolvedValue(DEFAULT_CONFIG)
    vi.spyOn(storageAdapter, "set").mockRejectedValue(
      new Error("Extension context invalidated."),
    )
    vi.spyOn(storageAdapter, "setMeta").mockResolvedValue(undefined)

    const store = createStore()
    await expect(
      store.set(writeConfigAtom, { language: DEFAULT_CONFIG.language }),
    ).resolves.toBeUndefined()
  })

  it("still propagates non-invalidation errors", async () => {
    vi.spyOn(storageAdapter, "get").mockResolvedValue(DEFAULT_CONFIG)
    vi.spyOn(storageAdapter, "set").mockRejectedValue(new Error("disk full"))
    vi.spyOn(storageAdapter, "setMeta").mockResolvedValue(undefined)
    vi.spyOn(console, "error").mockImplementation(() => {})

    const store = createStore()
    await expect(
      store.set(writeConfigAtom, { language: DEFAULT_CONFIG.language }),
    ).rejects.toThrow("disk full")
  })
})
