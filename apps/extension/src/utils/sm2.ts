export type ReviewGrade = "again" | "good" | "easy"

export interface SM2Word {
  interval: number
  repetitions: number
  nextReviewAt: Date
}

export interface SM2Result {
  interval: number
  repetitions: number
  nextReviewAt: Date
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function scheduleReview(
  word: SM2Word,
  grade: ReviewGrade,
  now: Date = new Date(),
): SM2Result {
  if (grade === "again") {
    return { interval: 1, repetitions: 0, nextReviewAt: addDays(now, 1) }
  }

  const { interval, repetitions } = word

  if (grade === "good") {
    let nextInterval: number
    if (repetitions === 0)
      nextInterval = 1
    else if (repetitions === 1)
      nextInterval = 3
    else nextInterval = Math.ceil(interval * 2.5)
    return { interval: nextInterval, repetitions: repetitions + 1, nextReviewAt: addDays(now, nextInterval) }
  }

  // "easy"
  let nextInterval: number
  if (repetitions === 0)
    nextInterval = 4
  else if (repetitions === 1)
    nextInterval = Math.ceil(interval * 3)
  else nextInterval = Math.ceil(interval * 4)
  return { interval: nextInterval, repetitions: repetitions + 1, nextReviewAt: addDays(now, nextInterval) }
}
