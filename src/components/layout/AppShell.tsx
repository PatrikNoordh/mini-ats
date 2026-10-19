import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Briefcase, KanbanSquare, LogOut, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";

const NAV = [
  { title: "Pipeline", to: "/pipeline", icon: KanbanSquare, admin: false },
  { title: "Jobb", to: "/jobs", icon: Briefcase, admin: false },
  { title: "Kandidater", to: "/candidates", icon: User, admin: false },
  { title: "Konton", to: "/admin/accounts", icon: Users, admin: true },
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        A
      </span>
      <span className="text-lg font-bold tracking-tight">Mini-ATS</span>
    </div>
  );
}

function AppSidebar() {
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
                  <span className="text-[15px]">{n.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}

function CustomerPicker() {
  const { customers, customerId, setCustomerId } = useActiveCustomer();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline">Kund</span>
      <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v)}>
        <SelectTrigger className="h-9 w-[170px] sm:w-[220px]" aria-label="Välj kund">
          <SelectValue placeholder="Välj kund…" />
        </SelectTrigger>
        <SelectContent>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.company_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Customers see their own company where admins see the customer picker. */
function CompanyName() {
  const { profile } = useAuth();
  if (!profile?.company_name) return null;
  return <span className="min-w-0 truncate text-sm font-semibold">{profile.company_name}</span>;
}

function UserMenu() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return null;
  const initials = profile.full_name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent"
          aria-label="Användarmeny"
        >
          <span className="hidden rounded-full border px-2 py-0.5 text-xs text-muted-foreground md:inline">
            {profile.role === "admin" ? "Admin" : "Kund"}
          </span>
          <span className="hidden text-sm font-medium md:inline">{profile.full_name}</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            {initials}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{profile.full_name}</div>
          <div className="text-xs font-normal text-muted-foreground">{profile.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Logga ut
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActingBanner() {
  const { isActingAs, customer, setCustomerId } = useActiveCustomer();
  if (!isActingAs || !customer) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning-foreground md:px-6">
      <span>
        Du arbetar som <strong className="font-bold">{customer.company_name}</strong>. Allt du
        skapar hamnar hos kunden.
      </span>
      <Button variant="warning" size="sm" onClick={() => setCustomerId(null)}>
        Lämna kundläge
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-3 md:px-6">
            <SidebarTrigger />
            {role === "admin" ? <CustomerPicker /> : <CompanyName />}
            <div className="ml-auto">
              <UserMenu />
            </div>
          </header>
          <ActingBanner />
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
