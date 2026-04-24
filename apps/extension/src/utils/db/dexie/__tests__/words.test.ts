import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  addWord,
  canAddWord,
  deleteWord,
  FREE_WORD_LIMIT,
  getWordCount,
  listWords,
  updateWordTranslation,
} from "../words"

const addMock = vi.fn()
const updateMock = vi.fn()
const countMock = vi.fn()
const deleteMock = vi.fn()
const orderByMock = vi.fn()
const reverseMock = vi.fn()
const toArrayMock = vi.fn()

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    words: {
      add: (...args: unknown[]) => addMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      count: (...args: unknown[]) => countMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
      orderBy: (...args: unknown[]) => orderByMock(...args),
    },
  },
}))

beforeEach(() => {
  addMock.mockReset()
  updateMock.mockReset()
  countMock.mockReset()
  deleteMock.mockReset()
  orderByMock.mockReset()
  reverseMock.mockReset()
  toArrayMock.mockReset()
})

describe("addWord", () => {
  it("adds a word and returns an id", async () => {
    addMock.mockResolvedValue(42)
    const id = await addWord({
      word: "ephemeral",
      context: "The ephemeral nature of life",
      sourceUrl: "https://example.com",
    })
    expect(id).toBe(42)
    expect(addMock).toHaveBeenCalledTimes(1)
    const arg = addMock.mock.calls[0][0] as {
      word: string
      context: string
      sourceUrl: string
      translation: undefined
      interval: number
      repetitions: number
      nextReviewAt: Date
      createdAt: Date
    }
    expect(arg.word).toBe("ephemeral")
    expect(arg.context).toBe("The ephemeral nature of life")
    expect(arg.sourceUrl).toBe("https://example.com")
    expect(arg.translation).toBeUndefined()
    expect(arg.interval).toBe(1)
    expect(arg.repetitions).toBe(0)
    expect(arg.nextReviewAt).toBeInstanceOf(Date)
    expect(arg.createdAt).toBeInstanceOf(Date)
  })
})

describe("updateWordTranslation", () => {
  it("calls db.words.update with correct args", async () => {
    updateMock.mockResolvedValue(1)
    await updateWordTranslation(7, "短暂的")
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledWith(7, { translation: "短暂的" })
  })
})

describe("getWordCount", () => {
  it("returns the count from db", async () => {
    countMock.mockResolvedValue(15)
    const count = await getWordCount()
    expect(count).toBe(15)
    expect(countMock).toHaveBeenCalledTimes(1)
  })
})

describe("canAddWord", () => {
  it("returns true when count is below FREE_WORD_LIMIT", async () => {
    countMock.mockResolvedValue(FREE_WORD_LIMIT - 1)
    await expect(canAddWord()).resolves.toBe(true)
  })

  it("returns false when count equals FREE_WORD_LIMIT", async () => {
    countMock.mockResolvedValue(FREE_WORD_LIMIT)
    await expect(canAddWord()).resolves.toBe(false)
  })

  it("returns false when count exceeds FREE_WORD_LIMIT", async () => {
    countMock.mockResolvedValue(FREE_WORD_LIMIT + 10)
    await expect(canAddWord()).resolves.toBe(false)
  })
})

describe("listWords", () => {
  it("returns ordered array from db", async () => {
    const words = [
      { id: 2, word: "baz", createdAt: new Date("2024-01-02") },
      { id: 1, word: "foo", createdAt: new Date("2024-01-01") },
    ]
    toArrayMock.mockResolvedValue(words)
    reverseMock.mockReturnValue({ toArray: (...args: unknown[]) => toArrayMock(...args) })
    orderByMock.mockReturnValue({ reverse: (...args: unknown[]) => reverseMock(...args) })

    const result = await listWords()
    expect(result).toEqual(words)
    expect(orderByMock).toHaveBeenCalledWith("createdAt")
    expect(reverseMock).toHaveBeenCalledTimes(1)
    expect(toArrayMock).toHaveBeenCalledTimes(1)
  })
})

describe("deleteWord", () => {
  it("calls db.words.delete with the given id", async () => {
    deleteMock.mockResolvedValue(undefined)
    await deleteWord(3)
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock).toHaveBeenCalledWith(3)
  })
})

describe("canAddWord — Pro bypass", () => {
  it("always returns true when isPro=true regardless of count", async () => {
    countMock.mockResolvedValueOnce(999)
    expect(await canAddWord(true)).toBe(true)
  })

  it("does not call db.count when isPro=true", async () => {
    countMock.mockClear()
    await canAddWord(true)
    expect(countMock).not.toHaveBeenCalled()
  })
})
