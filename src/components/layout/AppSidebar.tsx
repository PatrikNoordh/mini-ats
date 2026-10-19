import { Link, useRouterState } from "@tanstack/react-router";
import { Briefcase, KanbanSquare, User, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/layout/Logo";

const NAV = [
  { key: "pipeline", to: "/pipeline", icon: KanbanSquare, admin: false },
  { key: "jobs", to: "/jobs", icon: Briefcase, admin: false },
  { key: "candidates", to: "/candidates", icon: User, admin: false },
  { key: "accounts", to: "/admin/accounts", icon: Users, admin: true },
] as const;

export function AppSidebar() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { setOpenMobile } = useSidebar();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Logo />
      </SidebarHeader>
      <SidebarContent className="px-2 pt-2">
        <SidebarMenu>
          {NAV.filter((n) => !n.admin || role === "admin").map((n) => (
            <SidebarMenuItem key={n.to}>
              <SidebarMenuButton
                asChild
                isActive={path.startsWith(n.to)}
                size="lg"
                className="data-[active=true]:text-primary"
              >
                <Link to={n.to} onClick={() => setOpenMobile(false)}>
                  <n.icon className="h-4 w-4" />
                  <span className="text-nav">{t(`nav.${n.key}`)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
