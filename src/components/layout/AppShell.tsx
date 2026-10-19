import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CustomerPicker } from "@/components/layout/CustomerPicker";
import { CompanyName } from "@/components/layout/CompanyName";
import { UserMenu } from "@/components/layout/UserMenu";
import { ActingBanner } from "@/components/layout/ActingBanner";

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
