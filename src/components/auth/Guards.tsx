import { Navigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

export function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary"
        role="status"
        aria-label={t("common.loading")}
      />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const href = useRouterState({ select: (s) => s.location.href });
  if (isLoading) return <FullPageSpinner />;
  // Login sends the user back to the page they asked for.
  if (!user) return <Navigate to="/login" search={{ redirect: href }} replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { role, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (role !== "admin") return <Navigate to="/pipeline" replace />;
  return <>{children}</>;
}
