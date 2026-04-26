import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Button } from "@/components/ui/base-ui/button"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { i18n } from "@/utils/i18n"
import { inputTextAtom, sourceLangCodeAtom, targetLangCodeAtom, translateRequestAtom } from "../atoms"

function createClickId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === "function")
    return randomUUID.call(globalThis.crypto)

  return `${Date.now()}:${Math.random().toString(36).slice(2)}`
}

export function TextInput() {
  const [value, setValue] = useAtom(inputTextAtom)
  const sourceLangCode = useAtomValue(sourceLangCodeAtom)
  const targetLangCode = useAtomValue(targetLangCodeAtom)
  const setTranslateRequest = useSetAtom(translateRequestAtom)

  const handleTranslate = () => {
    if (!value.trim())
      return
    setTranslateRequest({
      inputText: value,
      sourceLanguage: sourceLangCode,
      targetLanguage: targetLangCode,
      timestamp: Date.now(),
      clickId: createClickId(),
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleTranslate()
    }
  }

  return (
    <div
      className="relative"
    >
      <Textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={i18n.t("translationHub.inputPlaceholder")}
        className="h-96 min-h-0 resize-none px-4 py-3 text-lg!"
        style={{ userSelect: "text" }}
      />

      <Button
        onClick={handleTranslate}
        disabled={!value.trim()}
        size="sm"
        className="absolute bottom-3 right-3"
      >
        {i18n.t("translationHub.translate")}
        <span className="ml-1.5 text-xs">⌘↵</span>
      </Button>
    </div>
  )
}
