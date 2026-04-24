import type Word from "@/utils/db/dexie/tables/word"
import type { ReviewGrade } from "@/utils/sm2"
import { useCallback, useEffect, useState } from "react"
import { getDueWords, reviewWord } from "@/utils/db/dexie/words"
import { Flashcard } from "./flashcard"

export function ReviewPage() {
  const [queue, setQueue] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)

  useEffect(() => {
    void getDueWords().then((words) => {
      setQueue(words)
      setLoading(false)
      if (words.length === 0)
        setDone(true)
    })
  }, [])

  const handleGrade = useCallback(async (grade: ReviewGrade) => {
    const current = queue[0]
    if (!current)
      return
    await reviewWord(current.id!, grade)
    const next = queue.slice(1)
    setQueue(next)
    if (next.length === 0)
      setDone(true)
  }, [queue])

  if (loading) {
    return <div className="flex items-center justify-center p-16 text-muted-foreground text-sm">Loading...</div>
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-3">
        <p className="text-2xl">🎉</p>
        <p className="font-semibold">All done for today!</p>
        <p className="text-sm text-muted-foreground">Come back tomorrow for the next batch.</p>
      </div>
    )
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Review</h1>
        <span className="text-sm text-muted-foreground">
          {queue.length}
          {" "}
          left
        </span>
      </div>
      <Flashcard word={queue[0]} onGrade={handleGrade} />
    </div>
  )
}
