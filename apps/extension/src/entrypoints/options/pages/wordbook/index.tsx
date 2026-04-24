import type Word from "@/utils/db/dexie/tables/word"
import { useEffect, useState } from "react"
import { deleteWord, listWords } from "@/utils/db/dexie/words"

export function WordbookPage() {
  const [words, setWords] = useState<Word[] | null>(null)

  useEffect(() => {
    void listWords().then(setWords)
  }, [])

  const handleDelete = async (id: number) => {
    await deleteWord(id)
    setWords(prev => prev ? prev.filter(w => w.id !== id) : prev)
  }

  if (!words)
    return <div className="p-8 text-muted-foreground text-sm">Loading...</div>
  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-2 text-muted-foreground">
        <p className="text-sm">No words yet. Select text on any page and click the bookmark icon.</p>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Wordbook (
          {words.length}
          )
        </h1>
      </div>
      <div className="divide-y">
        {words.map(w => (
          <div key={w.id} className="py-3 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-medium">{w.word}</span>
              {w.translation && <span className="text-sm text-muted-foreground">{w.translation}</span>}
              <span className="text-xs text-muted-foreground truncate">{w.context}</span>
            </div>
            <button
              type="button"
              className="text-xs text-destructive hover:underline shrink-0"
              onClick={() => handleDelete(w.id!)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
