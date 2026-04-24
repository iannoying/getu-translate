import { browser, i18n } from "#imports"
import { Icon } from "@iconify/react"
import { Link, useLocation } from "react-router"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/base-ui/sidebar"

export function ToolsNav() {
  const { pathname } = useLocation()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{i18n.t("options.sidebar.tools")}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<a href={browser.runtime.getURL("/translation-hub.html")} target="_blank" rel="noopener noreferrer" />}>
              <Icon icon="tabler:language-hiragana" />
              <span>{i18n.t("options.tools.translationHub")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/wordbook" />} isActive={pathname === "/wordbook"}>
              <Icon icon="tabler:bookmark" />
              <span>{i18n.t("options.tools.wordbook")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
