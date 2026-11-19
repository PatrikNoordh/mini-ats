import type { LogoImage } from "@/components/layout/Logo";
import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { useBranding, useBrandingUrl } from "@/hooks/useBranding";

/**
 * The active customer's logo for the sidebar (ATS-54), with the company's name as its alt text,
 * or null for the Mini-ATS mark: an admin acting for nobody, a company without a logo, and while
 * the theme or the link loads or fails.
 */
export function useCompanyLogo(): LogoImage | null {
  const { customerId, customer } = useActiveCustomer();
  const branding = useBranding(customerId);
  const url = useBrandingUrl(customerId, branding.data?.logo_path ?? null);
  return url.data && customer ? { src: url.data, alt: customer.name } : null;
}
