import type { SM2Word } from "../sm2"
import { describe, expect, it } from "vitest"
import { scheduleReview } from "../sm2"

function makeWord(overrides: Partial<SM2Word> = {}): SM2Word {
  return {
    interval: 1,
    repetitions: 0,
    nextReviewAt: new Date(),
    ...overrides,
  }
}

describe("scheduleReview — Again", () => {
  it("resets interval to 1 and repetitions to 0 regardless of prior state", () => {
    const w = makeWord({ interval: 10, repetitions: 5 })
    const result = scheduleReview(w, "again", new Date())
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
  })

  it("sets nextReviewAt to ~1 day later", () => {
    const now = new Date("2026-05-01T10:00:00Z")
    const result = scheduleReview(makeWord(), "again", now)
    const diffDays = (result.nextReviewAt.getTime() - now.getTime()) / 86400000
    expect(diffDays).toBeCloseTo(1, 0)
  })
})

describe("scheduleReview — Good", () => {
  it("rep=0: interval becomes 1, rep becomes 1", () => {
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 0 }), "good", new Date())
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it("rep=1: interval becomes 3, rep becomes 2", () => {
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 1 }), "good", new Date())
    expect(result.interval).toBe(3)
    expect(result.repetitions).toBe(2)
  })

  it("rep>=2: interval multiplied by 2.5 (ceil)", () => {
    const result = scheduleReview(makeWord({ interval: 4, repetitions: 2 }), "good", new Date())
    expect(result.interval).toBe(Math.ceil(4 * 2.5))
    expect(result.repetitions).toBe(3)
  })
})

describe("scheduleReview — Easy", () => {
  it("rep=0: interval becomes 4, rep becomes 1", () => {
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 0 }), "easy", new Date())
    expect(result.interval).toBe(4)
    expect(result.repetitions).toBe(1)
  })

  it("rep=1: interval multiplied by 3 (ceil)", () => {
    const result = scheduleReview(makeWord({ interval: 4, repetitions: 1 }), "easy", new Date())
    expect(result.interval).toBe(Math.ceil(4 * 3))
    expect(result.repetitions).toBe(2)
  })

  it("rep>=2: interval multiplied by 4 (ceil)", () => {
    const result = scheduleReview(makeWord({ interval: 4, repetitions: 2 }), "easy", new Date())
    expect(result.interval).toBe(Math.ceil(4 * 4))
    expect(result.repetitions).toBe(3)
  })
})

describe("nextReviewAt calculation", () => {
  it("is based on provided now + interval days", () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const result = scheduleReview(makeWord({ interval: 1, repetitions: 1 }), "good", now)
    // Good, rep=1 → interval=3
    const expected = new Date("2026-05-04T00:00:00Z")
    expect(result.nextReviewAt.getTime()).toBe(expected.getTime())
  })
})
