import type Word from "@/utils/db/dexie/tables/word"
import type { ReviewGrade } from "@/utils/sm2"
import { useState } from "react"
import { GradeButtons } from "./grade-buttons"

interface FlashcardProps {
  word: Word
  onGrade: (grade: ReviewGrade) => void
}

export function Flashcard({ word, onGrade }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false)

  return (
    <div className="flex flex-col items-center gap-6 max-w-lg mx-auto">
      <div
        className="w-full rounded-xl border bg-card p-8 text-center cursor-pointer min-h-48 flex flex-col items-center justify-center gap-3 select-none"
        onClick={() => setFlipped(f => !f)}
      >
        <p className="text-2xl font-semibold">{word.word}</p>
        {flipped && (
          <div className="flex flex-col gap-2 mt-2">
            {word.translation && (
              <p className="text-base text-muted-foreground">{word.translation}</p>
            )}
            {word.context && (
              <p className="text-sm text-muted-foreground italic border-t pt-2">{word.context}</p>
            )}
          </div>
        )}
        {!flipped && (
          <p className="text-xs text-muted-foreground mt-2">Click to reveal</p>
        )}
      </div>
      <GradeButtons onGrade={onGrade} disabled={!flipped} />
    </div>
  )
}
