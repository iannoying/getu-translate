import type { TranslationState } from "@/types/translation-state"
import { atom } from "jotai"
import { translationStateSchema } from "@/types/translation-state"
import { swallowExtensionLifecycleError } from "../extension-lifecycle"
import { onMessage, sendMessage } from "../message"

export function createTranslationStateAtomForContentScript(defaultValue: TranslationState) {
  const baseAtom = atom<TranslationState>(defaultValue)

  baseAtom.onMount = (setAtom) => {
    // Load initial value
    sendMessage("getEnablePageTranslationFromContentScript", undefined)
      .then((enabled) => {
        const parsed = translationStateSchema.safeParse({ enabled })
        if (parsed.success) {
          setAtom(parsed.data)
        }
      })
      .catch(swallowExtensionLifecycleError("translationStateAtom initial sendMessage"))

    // Watch for changes
    return onMessage("notifyTranslationStateChanged", (msg) => {
      const parsed = translationStateSchema.safeParse(msg.data)
      if (parsed.success) {
        setAtom(parsed.data)
      }
    })
  }

  return baseAtom
}
