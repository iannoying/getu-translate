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
  onUpgradeClick,
}: {
  model: TranslateModel
  state: ModelCardState
  locked: boolean
  upgradeMessage: string
  onUpgradeClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id,
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
              升级 Pro
            </button>
          </div>
        ) : state.status === "loading" ? (
          <p className="model-card-loading">翻译中…</p>
        ) : state.status === "error" ? (
          <p className="model-card-error">{state.errorMessage ?? "翻译失败"}</p>
        ) : (
          <p className="model-card-text">{state.text ?? "—"}</p>
        )}
      </div>
    </article>
  )
}
