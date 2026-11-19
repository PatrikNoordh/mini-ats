import { useEffect } from "react";

import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { useBranding } from "@/hooks/useBranding";
import { THEMED_TOKENS, themeTokens } from "@/lib/theme";

/**
 * Applies the active customer's accent colour while the app shell is shown (ATS-53): to a
 * customer user their own company's, and to an admin acting for a customer that customer's. On
 * <html>, so dialogs and menus, which render outside the shell, get it too. An admin who acts for
 * nobody, a company without a theme, a theme still loading or failing to load, and the pages
 * outside the shell such as the sign-in page all keep the Mini-ATS theme.
 */
export function useCustomerTheme() {
  const { customerId } = useActiveCustomer();
  const { data: branding } = useBranding(customerId);
  const accent = branding?.accent_colour ?? null;

  useEffect(() => {
    const tokens = themeTokens(accent);
    if (!tokens) return;
    const root = document.documentElement;
    for (const token of THEMED_TOKENS) root.style.setProperty(token, tokens[token]);
    return () => {
      for (const token of THEMED_TOKENS) root.style.removeProperty(token);
    };
  }, [accent]);
}
