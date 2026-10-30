import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cvSignedUrl } from "@/lib/api/cvs";
import { removeCandidateCv, uploadCandidateCv } from "@/lib/candidate-cv";
import { CV_SIGNED_URL_MARGIN_SECONDS, CV_SIGNED_URL_SECONDS } from "@/lib/constants";
import { queryKeys } from "@/lib/stages";

/** A link refreshed before it stops working, so the open link in the panel always works. */
const CV_URL_REFRESH_MS = (CV_SIGNED_URL_SECONDS - CV_SIGNED_URL_MARGIN_SECONDS) * 1000;

/** A link that opens the CV at `path`, or nothing while the candidate has no CV. */
export function useCvUrl(customerId: string | null, path: string | null) {
  return useQuery({
    queryKey: queryKeys.cvUrl(customerId, path),
    queryFn: () => cvSignedUrl(path!),
    enabled: !!customerId && !!path,
    staleTime: CV_URL_REFRESH_MS,
    refetchInterval: CV_URL_REFRESH_MS,
  });
}

/**
 * The candidate list holds cv_path, and an open link may point at a file that changed. Removing
 * a CV also removes the candidate's assessments in the database (ATS-35).
 *
 * After a removal the links are only marked stale, not fetched again: until the list is back,
 * the panel still holds the old cv_path, and a link to the removed file would show "Could not
 * fetch the CV" for a moment, an error that stays cached for the next upload (ATS-35).
 */
function useInvalidateCv(customerId: string | null, { refetchLinks }: { refetchLinks: boolean }) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.candidates(customerId) });
    qc.invalidateQueries({
      queryKey: queryKeys.cvUrls(customerId),
      refetchType: refetchLinks ? "active" : "none",
    });
    qc.invalidateQueries({ queryKey: queryKeys.assessmentsAll(customerId) });
  };
}

export function useUploadCv(customerId: string | null) {
  const invalidate = useInvalidateCv(customerId, { refetchLinks: true });
  return useMutation({
    mutationFn: ({ candidateId, file }: { candidateId: string; file: File }) =>
      uploadCandidateCv(customerId!, candidateId, file),
    // Also after a failure: the file may be replaced although cv_path could not be saved.
    onSettled: invalidate,
  });
}

export function useRemoveCv(customerId: string | null) {
  const invalidate = useInvalidateCv(customerId, { refetchLinks: false });
  return useMutation({
    mutationFn: (candidateId: string) => removeCandidateCv(customerId!, candidateId),
    onSettled: invalidate,
  });
}
