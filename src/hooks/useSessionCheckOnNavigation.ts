import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Asks Auth on each page change whether the session still lives, so a device signed out by a
 * password change elsewhere notices at once (ATS-34). The first page is checked on sign-in.
 */
export function useSessionCheckOnNavigation() {
  const { checkSession } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    void checkSession();
  }, [pathname, checkSession]);
}
