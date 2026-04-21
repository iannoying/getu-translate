import type { InputTranslationLang } from "@/types/config/config"
import { useAtom } from "jotai"
import { useCallback, useEffect, useRef } from "react"
import { useProGuard } from "@/hooks/use-pro-guard"
import { ANALYTICS_FEATURE, ANALYTICS_SURFACE } from "@/types/analytics"
import { createFeatureUsageContext, trackFeatureAttempt } from "@/utils/analytics"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { translateTextForInput } from "@/utils/host/translate/translate-variants"
import { useInputTranslationQuota } from "./quota/use-input-quota"
import { DEFAULT_TOKEN_LANGS, matchTokenTrigger } from "./triggers/token"

const SPACE_KEY = " "
const TRIGGER_COUNT = 3
const LAST_CYCLE_SWAPPED_KEY = "read-frog-input-translation-last-cycle-swapped"
const SPINNER_ID = "read-frog-input-translation-spinner"

function getLastCycleSwapped(): boolean {
  try {
    return sessionStorage.getItem(LAST_CYCLE_SWAPPED_KEY) === "true"
  }
  catch {
    return false
  }
}

function setLastCycleSwapped(swapped: boolean): void {
  try {
    sessionStorage.setItem(LAST_CYCLE_SWAPPED_KEY, String(swapped))
  }
  catch {
    // sessionStorage may not be available
  }
}

/**
 * Create and show a loading spinner near the input element
 * Uses the same style as page translation loading (border spinner with primary color)
 */
function showSpinner(element: HTMLElement): () => void {
  // Remove any existing spinner
  const existingSpinner = document.getElementById(SPINNER_ID)
  if (existingSpinner) {
    existingSpinner.remove()
  }

  // Create spinner element - same style as createLightweightSpinner in translate/ui/spinner.ts
  const spinner = document.createElement("span")
  spinner.id = SPINNER_ID

  // Use the same border spinner style as page translation
  // Colors: primary green (#4ade80 / oklch(76.5% 0.177 163.223)) and muted gray
  spinner.style.cssText = `
    position: absolute !important;
    display: inline-block !important;
    width: 10px !important;
    height: 10px !important;
    border: 3px solid #e5e5e5 !important;
    border-top: 3px solid #4ade80 !important;
    border-radius: 50% !important;
    box-sizing: content-box !important;
    z-index: 999999 !important;
    pointer-events: none !important;
  `

  // Respect user's motion preferences for accessibility
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

  if (!prefersReducedMotion) {
    // Use Web Animations API for rotation
    spinner.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(360deg)" },
      ],
      {
        duration: 600,
        iterations: Infinity,
        easing: "linear",
      },
    )
  }
  else {
    // For reduced motion, keep the spinner static but preserve the primary
    // segment so the loading state remains visible without animation.
    spinner.style.borderTopColor = "#4ade80"
  }

  // Calculate position - vertically centered relative to the element
  const rect = element.getBoundingClientRect()
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const spinnerSize = 16 // 10px + 3px border * 2

  // Vertically center for all element types
  const top = rect.top + scrollY + (rect.height - spinnerSize) / 2
  const left = rect.right + scrollX - spinnerSize - 8

  spinner.style.top = `${top}px`
  spinner.style.left = `${left}px`

  document.body.appendChild(spinner)

  // Return cleanup function
  return () => {
    spinner.remove()
  }
}

/**
 * Set text content with undo support using execCommand.
 * This allows Ctrl+Z to restore the original text.
 */
function setTextWithUndo(element: HTMLInputElement | HTMLTextAreaElement | HTMLElement, text: string) {
  element.focus()

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // Select all text in input/textarea
    element.select()
  }
  else if (element.isContentEditable) {
    // Select all content in contenteditable
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  // Use execCommand to insert text with undo support
  // Note: execCommand is deprecated but still the only way to support undo
  document.execCommand("insertText", false, text)

  // Dispatch input event for framework compatibility (React, Vue, etc.)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

export interface UseInputTranslationResult {
  upgradeDialogProps: ReturnType<typeof useProGuard>["dialogProps"]
}

export function useInputTranslation(): UseInputTranslationResult {
  const [inputTranslationConfig] = useAtom(configFieldsAtomMap.inputTranslation)
  const spaceTimestampsRef = useRef<number[]>([])
  const isTranslatingRef = useRef(false)
  const quota = useInputTranslationQuota()
  const { guard, dialogProps } = useProGuard()
  const quotaRef = useRef(quota)
  quotaRef.current = quota
  const guardRef = useRef(guard)
  guardRef.current = guard

  /**
   * Shared translation pipeline used by both triggers.
   *
   * When `tokenOverride` is undefined (triple-space path), we read the text
   * from the field, trim it, and honor the cycle-swap config. When it's
   * provided (token path), we use `tokenOverride.text` verbatim and the
   * parsed `toLang`, because the user already encoded the intent in the
   * trigger itself.
   */
  const handleTranslation = useCallback(async (
    element: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
    tokenOverride?: { text: string, toLang: string },
  ) => {
    if (isTranslatingRef.current)
      return

    // Security: skip password fields to prevent exposing sensitive data
    if (element instanceof HTMLInputElement && element.type === "password") {
      return
    }

    let text: string
    if (tokenOverride) {
      text = tokenOverride.text
    }
    else {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        text = element.value
      }
      else if (element.isContentEditable) {
        text = element.textContent || ""
      }
      else {
        return
      }
      text = text.trim()
    }

    if (!text.trim()) {
      return
    }

    // Set the single-flight guard BEFORE any await OR any setTextWithUndo
    // (which dispatches a synthetic input event — in token mode that event
    // would otherwise recurse into handleInput and re-trigger us).
    isTranslatingRef.current = true
    let hideSpinner: (() => void) | null = null
    try {
      // Billing gate: count the attempt against the free daily cap, or open
      // UpgradeDialog when exhausted. Incrementing before the provider call
      // is intentional — attempts (not only successes) count toward the cap
      // so a user cannot spin a failing provider to DoS the counter.
      //
      // The gate runs BEFORE setTextWithUndo so a quota-blocked free user
      // keeps their `//en ` trigger (or trailing spaces) intact — we don't
      // want to eat the trigger without translating.
      const liveQuota = quotaRef.current
      if (liveQuota.isLoading) {
        return
      }
      const allowed = await liveQuota.checkAndIncrement()
      if (!allowed) {
        guardRef.current("input_translate_unlimited", { source: "input-translation-daily-limit" })
        return
      }

      // Quota passed — now strip the trigger / trailing whitespace. The
      // synthetic input event this dispatches is a no-op because
      // isTranslatingRef is already set above.
      setTextWithUndo(element, text)

      let fromLang: InputTranslationLang = inputTranslationConfig.fromLang
      let toLang: InputTranslationLang = inputTranslationConfig.toLang

      if (tokenOverride) {
        // DEFAULT_TOKEN_LANGS only maps to ISO 639-3 codes that live inside
        // the InputTranslationLang union; the cast tells the type system
        // what runtime has already guaranteed.
        toLang = tokenOverride.toLang as InputTranslationLang
      }
      else if (inputTranslationConfig.enableCycle) {
        const wasSwapped = getLastCycleSwapped()
        if (wasSwapped) {
          // Already swapped last time, use original direction
          setLastCycleSwapped(false)
        }
        else {
          // Swap direction
          ;[fromLang, toLang] = [toLang, fromLang]
          setLastCycleSwapped(true)
        }
      }

      // Show spinner near the input element
      hideSpinner = showSpinner(element)

      // Store original text to detect if user edited during translation
      const originalText = text

      try {
        const translatedText = await trackFeatureAttempt(
          createFeatureUsageContext(
            ANALYTICS_FEATURE.INPUT_TRANSLATION,
            ANALYTICS_SURFACE.INPUT_TRANSLATION,
          ),
          () => translateTextForInput(text, fromLang, toLang),
        )

        // Check if element content changed during translation (user input)
        let currentText: string
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          currentText = element.value
        }
        else if (element.isContentEditable) {
          currentText = element.textContent || ""
        }
        else {
          currentText = originalText
        }

        // Only apply translation if content hasn't changed during async operation
        if (currentText === originalText && translatedText) {
          setTextWithUndo(element, translatedText)
        }
      }
      catch (error) {
        console.error("Input translation error:", error)
      }
    }
    finally {
      hideSpinner?.()
      isTranslatingRef.current = false
    }
  }, [inputTranslationConfig.fromLang, inputTranslationConfig.toLang, inputTranslationConfig.enableCycle])

  useEffect(() => {
    if (!inputTranslationConfig.enabled)
      return

    if (inputTranslationConfig.triggerMode === "token") {
      // Token mode: listen to input events, match `//<lang>` at the end of
      // the field, and translate. We skip while an IME composition is in
      // progress so typing Chinese / Japanese / Korean through an IME
      // doesn't fire spurious matches on intermediate composed state.
      const handleInput = (event: Event) => {
        const inputEvent = event as InputEvent
        if (inputEvent.isComposing) {
          return
        }
        const activeElement = document.activeElement
        const isInputField = activeElement instanceof HTMLInputElement
          || activeElement instanceof HTMLTextAreaElement
          || (activeElement instanceof HTMLElement && activeElement.isContentEditable)

        if (!isInputField || !activeElement) {
          return
        }

        let value: string
        if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
          value = activeElement.value
        }
        else if (activeElement.isContentEditable) {
          value = activeElement.textContent || ""
        }
        else {
          return
        }

        const match = matchTokenTrigger(value, {
          prefix: inputTranslationConfig.tokenPrefix,
          knownLangs: DEFAULT_TOKEN_LANGS,
        })
        if (match == null) {
          return
        }

        void handleTranslation(
          activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement,
          { text: match.text, toLang: match.toLang },
        )
      }

      document.addEventListener("input", handleInput, true)
      return () => {
        document.removeEventListener("input", handleInput, true)
      }
    }

    // Triple-space mode (existing behavior)
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only process space key
      if (event.key !== SPACE_KEY) {
        // Reset on any other key
        spaceTimestampsRef.current = []
        return
      }

      // Check if the active element is an input field
      const activeElement = document.activeElement
      const isInputField = activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
        || (activeElement instanceof HTMLElement && activeElement.isContentEditable)

      if (!isInputField || !activeElement) {
        spaceTimestampsRef.current = []
        return
      }

      const now = Date.now()
      const timestamps = spaceTimestampsRef.current

      // Remove timestamps older than threshold
      const timeThreshold = inputTranslationConfig.timeThreshold
      while (timestamps.length > 0 && now - timestamps[0] > timeThreshold * (TRIGGER_COUNT - 1)) {
        timestamps.shift()
      }

      // Add current timestamp
      timestamps.push(now)

      // Check if we have enough rapid presses
      if (timestamps.length >= TRIGGER_COUNT) {
        // Check if all presses are within the time threshold
        const allWithinThreshold = timestamps.every((ts, i) => {
          if (i === 0)
            return true
          return ts - timestamps[i - 1] <= timeThreshold
        })

        if (allWithinThreshold) {
          event.preventDefault()
          spaceTimestampsRef.current = []
          void handleTranslation(activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [
    inputTranslationConfig.enabled,
    inputTranslationConfig.timeThreshold,
    inputTranslationConfig.triggerMode,
    inputTranslationConfig.tokenPrefix,
    handleTranslation,
  ])

  return { upgradeDialogProps: dialogProps }
}
