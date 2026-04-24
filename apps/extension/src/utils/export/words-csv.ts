import type Word from "@/utils/db/dexie/tables/word"

function csvField(value: string | undefined): string {
  const s = value ?? ""
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`
  }
  return s
}

export function wordsToCSV(words: Word[]): string {
  const header = "word,context,translation,interval,repetitions,nextReviewAt"
  const rows = words.map(w =>
    [
      csvField(w.word),
      csvField(w.context),
      csvField(w.translation),
      String(w.interval),
      String(w.repetitions),
      w.nextReviewAt.toISOString(),
    ].join(","),
  )
  return [header, ...rows].join("\n")
}

export function downloadCSV(words: Word[], filename = "wordbook.csv"): void {
  const csv = wordsToCSV(words)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
