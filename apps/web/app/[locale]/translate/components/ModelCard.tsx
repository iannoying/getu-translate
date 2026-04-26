"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { TranslateModel } from "@getu/definitions"

export interface ModelCardState {
  /** "loading" while a translation streams in (M6.5); "done" once finalized; "error" on failure. */
  status: "idle" | "loading" | "done" | "error"
  text?: string
  errorMessage?: string
}

export interface ModelCardLabels {
  upgradeButton: string
  loading: string
  errorFallback: string
}

/**
 * Single model column on /translate. Free users see 2 unlocked cards
 * (google + microsoft) plus 9 "locked" Pro cards that show an upgrade CTA
 * instead of a translation. The Pro card never sends a request, so the
 * upgrade prompt is the **entire** value the column delivers — keep its
 * copy tight and visually distinct from a real translation.
 */
export function ModelCard({
  model,
  state,
  locked,
  upgradeMessage,
  labels,
  onUpgradeClick,
}: {
  model: TranslateModel
  state: ModelCardState
  locked: boolean
  upgradeMessage: string
  labels: ModelCardLabels
  onUpgradeClick: () => void
}) {
  // Locked cards (Pro-only models for free users) are excluded from drag
  // because reordering a column the user can't actually use is meaningless
  // UX noise. The handle stays visible but visually disabled to make the
  // distinction clear.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id,
    disabled: locked,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`model-card ${locked ? "model-card-locked" : ""}`}
      aria-label={`${model.displayName} translation column`}
    >
      <header className="model-card-header">
        <button
          type="button"
          className="model-card-handle"
          aria-label={`Drag ${model.displayName} column`}
          disabled={locked}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <h3 className="model-card-title">
          {model.displayName}
          {locked && <span className="model-card-lock" aria-label="Pro only">🔒</span>}
        </h3>
      </header>
      <div className="model-card-body">
        {locked ? (
          <div className="model-card-upgrade">
            <p>{upgradeMessage}</p>
            <button type="button" className="button primary small" onClick={onUpgradeClick}>
              {labels.upgradeButton}
            </button>
          </div>
        ) : state.status === "loading" ? (
          <p className="model-card-loading">{labels.loading}</p>
        ) : state.status === "error" ? (
          <p className="model-card-error">{state.errorMessage ?? labels.errorFallback}</p>
        ) : (
          <p className="model-card-text">{state.text ?? "—"}</p>
        )}
      </div>
    </article>
  )
}
