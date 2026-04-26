import { browser } from "#imports"
import {
  IconArrowUpRight,
  IconFileDescription,
  IconLayout,
  IconScan,
  IconSubtitles,
  IconUpload,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/base-ui/button"
import { WEB_DOCUMENT_TRANSLATE_URL } from "@/utils/constants/url"
import { i18n } from "@/utils/i18n"

const FORMATS = ["PDF", "EPUB", "DOCX", "TXT", "HTML", "MD", "SRT", "ASS", "VTT", "LRC"] as const

const FEATURES = [
  {
    titleKey: "translationWorkbench.pdfProTitle",
    bodyKey: "translationWorkbench.pdfProBody",
    icon: IconScan,
  },
  {
    titleKey: "translationWorkbench.babelDocTitle",
    bodyKey: "translationWorkbench.babelDocBody",
    icon: IconLayout,
  },
  {
    titleKey: "translationWorkbench.subtitleFilesTitle",
    bodyKey: "translationWorkbench.subtitleFilesBody",
    icon: IconSubtitles,
  },
] as const

export function SidebarDocumentTab() {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-normal">
          {i18n.t("translationWorkbench.documentTitle")}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {i18n.t("translationWorkbench.documentDescription")}
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="sidebar-document-formats">
        <div className="flex items-center justify-between gap-3">
          <h3 id="sidebar-document-formats" className="text-sm font-semibold">
            {i18n.t("translationWorkbench.documentFormats")}
          </h3>
          <a
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            href={WEB_DOCUMENT_TRANSLATE_URL}
            target="_blank"
            rel="noreferrer"
          >
            {i18n.t("translationWorkbench.learnMore")}
            <IconArrowUpRight className="size-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {FORMATS.map(format => (
            <div
              key={format}
              className="grid h-16 place-items-center rounded-md border border-border bg-card text-card-foreground"
            >
              <div className="flex flex-col items-center gap-1">
                <IconFileDescription className="size-5 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] font-semibold">{format}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Button
        type="button"
        className="h-11 w-full gap-2 text-sm font-semibold"
        onClick={() => void browser.tabs.create({ url: WEB_DOCUMENT_TRANSLATE_URL })}
      >
        <IconUpload className="size-4" />
        {i18n.t("translationWorkbench.uploadDocument")}
      </Button>

      <section className="space-y-3" aria-labelledby="sidebar-document-features">
        <h3 id="sidebar-document-features" className="text-sm font-semibold">
          {i18n.t("translationWorkbench.documentFeatures")}
        </h3>
        <div className="space-y-2">
          {FEATURES.map((feature) => {
            const FeatureIcon = feature.icon

            return (
              <article key={feature.titleKey} className="flex gap-3 rounded-md border border-border bg-card p-3 text-card-foreground">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <FeatureIcon className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h4 className="text-sm font-semibold">{i18n.t(feature.titleKey)}</h4>
                  <p className="text-xs leading-5 text-muted-foreground">{i18n.t(feature.bodyKey)}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
