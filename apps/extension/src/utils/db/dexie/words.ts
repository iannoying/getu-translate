import type Word from "./tables/word"
import { db } from "./db"

export const FREE_WORD_LIMIT = 100

export async function addWord(data: {
  word: string
  context: string
  sourceUrl: string
}): Promise<number> {
  return db.words.add({
    word: data.word,
    context: data.context,
    sourceUrl: data.sourceUrl,
    interval: 1,
    repetitions: 0,
    nextReviewAt: new Date(),
    createdAt: new Date(),
  })
}

export async function updateWordTranslation(
  id: number,
  translation: string,
): Promise<void> {
  await db.words.update(id, { translation })
}

export async function getWordCount(): Promise<number> {
  return db.words.count()
}

export async function canAddWord(): Promise<boolean> {
  const count = await getWordCount()
  return count < FREE_WORD_LIMIT
}

export async function listWords(): Promise<Word[]> {
  return db.words.orderBy("createdAt").reverse().toArray()
}

export async function deleteWord(id: number): Promise<void> {
  await db.words.delete(id)
}
