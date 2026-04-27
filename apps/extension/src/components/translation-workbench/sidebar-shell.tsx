import { IconFileText, IconLanguage, IconX } from "@tabler/icons-react"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"
import { SidebarDocumentTab } from "./sidebar-document-tab"
import { SidebarTextTab } from "./sidebar-text-tab"

type SidebarTab = "text" | "document"

interface SidebarShellProps {
  portalContainer?: HTMLElement | null
  onClose: () => void
}

export function SidebarShell({ portalContainer, onClose }: SidebarShellProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("text")

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <header className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-normal">
            {i18n.t("translationWorkbench.sidebarTitle")}
          </h1>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={i18n.t("translationWorkbench.closeSidebar")}
            onClick={onClose}
          >
            <IconX className="size-4" />
          </Button>
        </header>

        {activeTab === "text" ? <SidebarTextTab portalContainer={portalContainer} /> : <SidebarDocumentTab />}
      </main>

      <aside
        className="flex w-20 shrink-0 flex-col items-center gap-3 border-l border-border bg-muted/30 px-2 py-5"
        role="tablist"
        aria-label={i18n.t("translationWorkbench.sidebarTitle")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "text"}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-md px-2 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            activeTab === "text" && "bg-background text-primary shadow-xs ring-1 ring-border",
          )}
          onClick={() => setActiveTab("text")}
        >
          <IconLanguage className="size-5" />
          <span>{i18n.t("translationWorkbench.textTab")}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "document"}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-md px-2 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            activeTab === "document" && "bg-background text-primary shadow-xs ring-1 ring-border",
          )}
          onClick={() => setActiveTab("document")}
        >
          <IconFileText className="size-5" />
          <span>{i18n.t("translationWorkbench.documentTab")}</span>
        </button>
      </aside>
    </div>
  )
}
