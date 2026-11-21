import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { useBranding, useBrandingUrl } from "@/hooks/useBranding";
import { chipOpacity } from "@/lib/theme";
import type { BackgroundDim } from "@/types";

/**
 * A company's background image, how much it is dimmed (ATS-55), and how solid the chips over it
 * are, from 0 to 1 (ATS-66).
 */
export interface CompanyBackground {
  url: string;
  dim: BackgroundDim;
  chipOpacity: number;
}

/**
 * The active customer's background image for the shell, or null for none: an admin acting for
 * nobody, a company without one, and while the theme or the link loads or fails.
 */
export function useCompanyBackground(): CompanyBackground | null {
  const { customerId } = useActiveCustomer();
  const branding = useBranding(customerId);
  const url = useBrandingUrl(customerId, branding.data?.background_path ?? null);
  const opacity = chipOpacity(branding.data ?? null);
  return url.data && branding.data && opacity !== null
    ? { url: url.data, dim: branding.data.background_dim, chipOpacity: opacity }
    : null;
}
