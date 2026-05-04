import { notFound } from "next/navigation"
import { UpgradeModalE2EClient } from "./UpgradeModalE2EClient"

export default function UpgradeModalE2EPage() {
  if (process.env.NEXT_PUBLIC_E2E !== "1") {
    notFound()
  }

  return <UpgradeModalE2EClient />
}
