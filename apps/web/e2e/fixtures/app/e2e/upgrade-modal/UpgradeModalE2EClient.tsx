"use client"

import { useState } from "react"
import { UpgradeModal, type UpgradeModalSource } from "@/app/[locale]/translate/components/UpgradeModal"
import { messages } from "@/lib/i18n/messages"

const SOURCES = [
  "free_quota_exceeded",
  "pro_model_clicked",
  "pdf_quota_exceeded",
  "char_limit_exceeded",
  "history_cleanup_warning",
] as const satisfies readonly UpgradeModalSource[]

export function UpgradeModalE2EClient() {
  const [source, setSource] = useState<UpgradeModalSource | null>(null)

  return (
    <main>
      <h1>Upgrade modal E2E</h1>
      <div>
        {SOURCES.map(source => (
          <button
            key={source}
            type="button"
            onClick={() => setSource(source)}
          >
            {`Open ${source}`}
          </button>
        ))}
      </div>
      <UpgradeModal
        open={source !== null}
        source={source}
        onClose={() => setSource(null)}
        locale="en"
        labels={messages.en.translate.upgradeModal}
      />
    </main>
  )
}
