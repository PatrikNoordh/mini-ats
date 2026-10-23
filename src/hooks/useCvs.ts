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

/** The candidate list holds cv_path, and an open link may point at a file that changed. */
function useInvalidateCv(customerId: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.candidates(customerId) });
    qc.invalidateQueries({ queryKey: queryKeys.cvUrls(customerId) });
  };
}

export function useUploadCv(customerId: string | null) {
  const invalidate = useInvalidateCv(customerId);
  return useMutation({
    mutationFn: ({ candidateId, file }: { candidateId: string; file: File }) =>
      uploadCandidateCv(customerId!, candidateId, file),
    // Also after a failure: the file may be replaced although cv_path could not be saved.
    onSettled: invalidate,
  });
}

export function useRemoveCv(customerId: string | null) {
  const invalidate = useInvalidateCv(customerId);
  return useMutation({
    mutationFn: (candidateId: string) => removeCandidateCv(customerId!, candidateId),
    onSettled: invalidate,
  });
}
