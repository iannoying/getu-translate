import { buildLegacyLocaleRedirectScript } from "@/lib/i18n/legacy-redirect-script"

export function LegacyLocaleRedirectPage({ targetPath }: { targetPath: string }) {
  return <script dangerouslySetInnerHTML={{ __html: buildLegacyLocaleRedirectScript(targetPath) }} />
}
