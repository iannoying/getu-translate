"use client"

import { useEffect, useState } from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import {
  TRANSLATE_MODELS,
  TRANSLATE_MODEL_BY_ID,
  isFreeTranslateModel,
  type TranslateModelId,
} from "@getu/definitions"
import { ModelCard, type ModelCardState } from "./ModelCard"

const ORDER_STORAGE_KEY = "getu.translate.model-order.v1"

const DEFAULT_ORDER: TranslateModelId[] = TRANSLATE_MODELS.map(m => m.id)

function sanitizeOrder(input: unknown): TranslateModelId[] {
  if (!Array.isArray(input)) return DEFAULT_ORDER
  const known = new Set(DEFAULT_ORDER)
  const seen = new Set<TranslateModelId>()
  const cleaned: TranslateModelId[] = []
  for (const id of input) {
    if (typeof id === "string" && known.has(id as TranslateModelId) && !seen.has(id as TranslateModelId)) {
      cleaned.push(id as TranslateModelId)
      seen.add(id as TranslateModelId)
    }
  }
  // Append any models the saved order missed (e.g. new models added in a later release).
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) cleaned.push(id)
  }
  return cleaned
}

/**
 * Vertically scrollable list of all 11 model cards. The user can drag to
 * reorder; order is persisted to localStorage. Add / remove is intentionally
 * NOT supported — the registry is fixed by `@getu/definitions`.
 */
export function ModelGrid({
  plan,
  results,
  upgradeMessage,
  onUpgradeClick,
}: {
  plan: "anonymous" | "free" | "pro" | "enterprise"
  results: Partial<Record<TranslateModelId, ModelCardState>>
  upgradeMessage: string
  onUpgradeClick: (modelId: TranslateModelId) => void
}) {
  // SSR / static-export safe: server emits the default order, so the static
  // HTML has the registry order baked in (good for SEO + new visitors).
  // After hydration, useEffect reads localStorage; for returning users with
  // a custom order this means a one-frame flash of the default order before
  // the saved order takes over. Eliminating the flash would require hiding
  // the grid until hydrated, which would also hide the demo content from
  // search-engine crawlers — explicit trade-off in favor of SEO.
  const [order, setOrder] = useState<TranslateModelId[]>(DEFAULT_ORDER)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ORDER_STORAGE_KEY)
      if (raw) {
        const next = sanitizeOrder(JSON.parse(raw))
        // Skip the setState if the saved order already matches DEFAULT_ORDER
        // (avoids one wasted render for new users who never reordered).
        if (next.some((id, i) => id !== DEFAULT_ORDER[i])) setOrder(next)
      }
    } catch {
      // ignore — fall back to default order
    }
  }, [])

  function persist(next: TranslateModelId[]) {
    setOrder(next)
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Non-fatal — Safari private mode etc. blocks storage.
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(active.id as TranslateModelId)
    const newIndex = order.indexOf(over.id as TranslateModelId)
    if (oldIndex === -1 || newIndex === -1) return
    persist(arrayMove(order, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="model-grid" role="list">
          {order.map(id => {
            const model = TRANSLATE_MODEL_BY_ID[id]
            const locked = plan === "anonymous" ? false : (plan === "free" && !isFreeTranslateModel(id))
            return (
              <ModelCard
                key={id}
                model={model}
                state={results[id] ?? { status: "idle" }}
                locked={locked}
                upgradeMessage={upgradeMessage}
                onUpgradeClick={() => onUpgradeClick(id)}
              />
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
