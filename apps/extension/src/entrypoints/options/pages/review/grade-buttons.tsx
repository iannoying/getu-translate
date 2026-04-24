import type { ReviewGrade } from "@/utils/sm2"

interface GradeButtonsProps {
  onGrade: (grade: ReviewGrade) => void
  disabled?: boolean
}

const GRADES: { grade: ReviewGrade, label: string, className: string }[] = [
  { grade: "again", label: "Again", className: "bg-destructive/10 hover:bg-destructive/20 text-destructive" },
  { grade: "good", label: "Good", className: "bg-primary/10 hover:bg-primary/20 text-primary" },
  { grade: "easy", label: "Easy", className: "bg-green-500/10 hover:bg-green-500/20 text-green-700" },
]

export function GradeButtons({ onGrade, disabled }: GradeButtonsProps) {
  return (
    <div className="flex gap-3 justify-center">
      {GRADES.map(({ grade, label, className }) => (
        <button
          key={grade}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(grade)}
          className={`px-6 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
