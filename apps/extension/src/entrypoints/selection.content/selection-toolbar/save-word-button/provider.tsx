import { i18n } from "#imports"
import { getDefaultStore, useAtomValue } from "jotai"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useEntitlements } from "@/hooks/use-entitlements"
import { isTranslateProviderConfig } from "@/types/config/provider"
import { isPro } from "@/types/entitlements"
import { configAtom } from "@/utils/atoms/config"
import { authClient } from "@/utils/auth/auth-client"
import { filterEnabledProvidersConfig } from "@/utils/config/helpers"
import { addWord, canAddWord, updateWordTranslation } from "@/utils/db/dexie/words"
import { translateTextCore } from "@/utils/host/translate/translate-text"
import { selectionContentAtom, selectionSessionAtom } from "../atoms"

export function useSaveWord() {
  const [saved, setSaved] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const selectionContent = useAtomValue(selectionContentAtom)
  const selectionSession = useAtomValue(selectionSessionAtom)

  useEffect(() => {
    setSaved(false)
  }, [selectionContent])

  const session = authClient.useSession()
  const userId = session?.data?.user?.id ?? null
  const { data: entitlements } = useEntitlements(userId)
  const isProUser = isPro(entitlements)

  const handleSave = useCallback(async () => {
    if (!selectionContent) {
      return
    }

    const allowed = await canAddWord(isProUser)
    if (!allowed) {
      setUpgradeOpen(true)
      return
    }

    const context = selectionSession?.contextSnapshot.text ?? selectionContent
    const sourceUrl = window.location.href

    const id = await addWord({
      word: selectionContent,
      context,
      sourceUrl,
    })

    setSaved(true)
    toast.success(i18n.t("wordbook.saved"))

    void (async () => {
      try {
        const store = getDefaultStore()
        const config = store.get(configAtom)
        const providers = filterEnabledProvidersConfig(config.providersConfig).filter(isTranslateProviderConfig)
        const providerConfig = providers[0]

        if (!providerConfig) {
          return
        }

        const translation = await translateTextCore({
          text: selectionContent,
          langConfig: config.language,
          providerConfig,
          enableAIContentAware: false,
          extraHashTags: ["wordbookSave"],
        })

        await updateWordTranslation(id, translation)
      }
      catch (error) {
        console.warn("[wordbook] background translation failed", error)
      }
    })()
  }, [selectionContent, selectionSession, isProUser])

  return {
    save: handleSave,
    saved,
    hasSelection: Boolean(selectionContent?.trim()),
    upgradeOpen,
    setUpgradeOpen,
  }
}
