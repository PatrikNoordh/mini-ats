import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { useBranding, useBrandingUrl } from "@/hooks/useBranding";
import type { BackgroundDim } from "@/types";

/** A company's background image and how much it is dimmed (ATS-55). */
export interface CompanyBackground {
  url: string;
  dim: BackgroundDim;
}

/**
 * The active customer's background image for the shell, or null for none: an admin acting for
 * nobody, a company without one, and while the theme or the link loads or fails.
 */
export function useCompanyBackground(): CompanyBackground | null {
  const { customerId } = useActiveCustomer();
  const branding = useBranding(customerId);
  const url = useBrandingUrl(customerId, branding.data?.background_path ?? null);
  return url.data && branding.data ? { url: url.data, dim: branding.data.background_dim } : null;
}
