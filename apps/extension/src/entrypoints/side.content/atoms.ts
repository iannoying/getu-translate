import { atom, createStore } from "jotai"
import { createTranslationStateAtomForContentScript } from "@/utils/atoms/translation-state"

export { isSideOpenAtom } from "./utils/sidebar-open-state"

export const store = createStore()

export const isDraggingButtonAtom = atom(false)

export const enablePageTranslationAtom = createTranslationStateAtomForContentScript(
  { enabled: false },
)
