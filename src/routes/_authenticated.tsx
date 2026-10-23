import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/Guards";
import { AppShell } from "@/components/layout/AppShell";
import { useSessionCheckOnNavigation } from "@/hooks/useSessionCheckOnNavigation";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useSessionCheckOnNavigation();
  return (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}
