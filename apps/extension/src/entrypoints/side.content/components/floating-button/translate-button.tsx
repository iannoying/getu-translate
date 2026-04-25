import { RiTranslate } from "@remixicon/react"
import { IconCheck } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { swallowExtensionLifecycleError } from "@/utils/extension-lifecycle"
import { sendMessage } from "@/utils/message"
import { buildWebTranslateUrl, isPdfLikeUrl } from "@/utils/pdf-detection"
import { cn } from "@/utils/styles/utils"
import { enablePageTranslationAtom } from "../../atoms"
import HiddenButton from "./components/hidden-button"

export default function TranslateButton({ className }: { className: string }) {
  const translationState = useAtomValue(enablePageTranslationAtom)
  const isEnabled = translationState.enabled
  // PDF-tab heuristic from `window.location.href`. Synchronous; covers `.pdf`
  // suffix + arxiv/openreview style extensionless PDFs. The full content-type
  // tracker lives in the background — but content scripts on Chrome's native
  // PDF viewer don't run anyway, so this URL-only check is sufficient for
  // the tabs where the floating button actually mounts (Firefox built-in PDF.js,
  // file://, embedded viewers).
  const isPdf = isPdfLikeUrl(typeof window === "undefined" ? "" : window.location.href)

  return (
    <HiddenButton
      icon={<RiTranslate className="h-5 w-5" />}
      className={className}
      onClick={() => {
        if (isPdf) {
          // Hand off to the public web translator instead of trying to
          // translate the PDF in-place. New tab — keep the user's current PDF
          // tab intact in case they want to keep reading it.
          window.open(buildWebTranslateUrl(window.location.href), "_blank", "noopener,noreferrer")
          return
        }
        void sendMessage("tryToSetEnablePageTranslationOnContentScript", { enabled: !isEnabled })
          .catch(swallowExtensionLifecycleError("floating translate-button click"))
      }}
    >
      <IconCheck
        className={cn(
          "absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 text-white",
          // Hide the "translation enabled" indicator on PDF tabs — page-translation
          // state doesn't apply when the click hands off to the web translator.
          !isPdf && isEnabled ? "block" : "hidden",
        )}
      />
    </HiddenButton>
  )
}
