import { useState, type ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CustomerPicker } from "@/components/layout/CustomerPicker";
import { CompanyName } from "@/components/layout/CompanyName";
import { UserMenu } from "@/components/layout/UserMenu";
import { ActingBanner } from "@/components/layout/ActingBanner";
import { useCustomerTheme } from "@/hooks/useCustomerTheme";
import { useCompanyBackground } from "@/hooks/useCompanyBackground";
import { PageBackground } from "@/components/layout/PageBackground";
import { PageHeaderSlotContext } from "@/contexts/PageHeaderSlotContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  useCustomerTheme();
  const background = useCompanyBackground();
  // With a background image, the page's header moves into a second row of the top bar.
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  return (
    <PageHeaderSlotContext.Provider value={background ? headerSlot : null}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b bg-card">
              <div className="flex h-14 items-center gap-3 px-3 md:px-6">
                <SidebarTrigger />
                {role === "admin" ? <CustomerPicker /> : <CompanyName />}
                <div className="ml-auto">
                  <UserMenu />
                </div>
              </div>
              {background && (
                <div className="px-4 md:px-6">
                  <div ref={setHeaderSlot} className="bar-on-image" />
                </div>
              )}
            </header>
            <ActingBanner />
            <main
              className="relative isolate min-w-0 flex-1 p-4 md:p-6"
              data-background-image={background ? "" : undefined}
              style={
                background ? { "--surface-opacity": String(background.chipOpacity) } : undefined
              }
            >
              {background && <PageBackground background={background} />}
              <div className="content-on-image">{children}</div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </PageHeaderSlotContext.Provider>
  );
}
