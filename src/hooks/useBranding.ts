import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { brandingSignedUrl } from "@/lib/api/brandingFiles";
import { getBranding } from "@/lib/api/customerBranding";
import { resetTheme, saveTheme, type SavedImages, type ThemeChange } from "@/lib/branding";
import { BRANDING_SIGNED_URL_MARGIN_SECONDS, BRANDING_SIGNED_URL_SECONDS } from "@/lib/constants";
import { queryKeys } from "@/lib/stages";

/** A link refreshed before it stops working, so the logo never breaks on a page left open. */
const BRANDING_URL_REFRESH_MS =
  (BRANDING_SIGNED_URL_SECONDS - BRANDING_SIGNED_URL_MARGIN_SECONDS) * 1000;

/** The active customer's theme; null when it has none. Off without an active customer. */
export function useBranding(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.branding(customerId),
    queryFn: () => getBranding(customerId!),
    enabled: !!customerId,
  });
}

/** A link to show a branding image at `path`, or nothing while there is none. */
export function useBrandingUrl(customerId: string | null, path: string | null) {
  return useQuery({
    queryKey: queryKeys.brandingUrl(customerId, path),
    queryFn: () => brandingSignedUrl(path!),
    enabled: !!customerId && !!path,
    staleTime: BRANDING_URL_REFRESH_MS,
    refetchInterval: BRANDING_URL_REFRESH_MS,
  });
}

/**
 * The theme and its links follow a save or a reset, also after a failure: a logo may be replaced
 * although the row could not be saved. The logo keeps its path when it is replaced, so its link
 * is fetched again for the new file.
 */
function useInvalidateBranding(customerId: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.branding(customerId) });
    qc.invalidateQueries({ queryKey: queryKeys.brandingUrls(customerId) });
  };
}

export function useSaveTheme(customerId: string | null) {
  const invalidate = useInvalidateBranding(customerId);
  return useMutation({
    mutationFn: ({ saved, change }: { saved: SavedImages; change: ThemeChange }) =>
      saveTheme(customerId!, saved, change),
    onSettled: invalidate,
  });
}

export function useResetTheme(customerId: string | null) {
  const invalidate = useInvalidateBranding(customerId);
  return useMutation({ mutationFn: () => resetTheme(customerId!), onSettled: invalidate });
}
