import type Word from "@/utils/db/dexie/tables/word"

function wordToBlock(w: Word): string {
  const lines = [
    `## ${w.word}`,
    "",
    "---",
    `word: ${w.word}`,
    `translation: ${w.translation ?? ""}`,
    `interval: ${w.interval}`,
    `repetitions: ${w.repetitions}`,
    `nextReviewAt: ${w.nextReviewAt.toISOString().slice(0, 10)}`,
    `source: ${w.sourceUrl}`,
    "---",
    "",
    w.context ? `> ${w.context}` : "",
    "",
  ]
  return lines.join("\n")
}

export function wordsToMarkdown(words: Word[]): string {
  return words.map(wordToBlock).join("\n---\n\n")
}

export function downloadMarkdown(words: Word[], filename = "wordbook.md"): void {
  const md = wordsToMarkdown(words)
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
