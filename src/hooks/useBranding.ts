import { useQuery } from "@tanstack/react-query";

import { getBranding } from "@/lib/api/customerBranding";
import { queryKeys } from "@/lib/stages";

/** The active customer's theme; null when it has none. Off without an active customer. */
export function useBranding(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.branding(customerId),
    queryFn: () => getBranding(customerId!),
    enabled: !!customerId,
  });
}
