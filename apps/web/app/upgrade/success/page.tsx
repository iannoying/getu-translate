import { LegacyLocaleRedirectPage } from "@/app/legacy-locale-redirect"

export default function UpgradeSuccessRootRedirectPage() {
  return <LegacyLocaleRedirectPage targetPath="/upgrade/success" />
}
