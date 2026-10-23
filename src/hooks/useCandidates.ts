import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteCandidate, listCandidates } from "@/lib/api/candidates";
import { saveCandidate, type SaveCandidateVars } from "@/lib/save-candidate";
import { queryKeys } from "@/lib/stages";

export function useCandidates(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.candidates(customerId),
    queryFn: () => listCandidates(customerId!),
    enabled: !!customerId,
  });
}

export function useSaveCandidate(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: SaveCandidateVars) => saveCandidate(customerId!, vars),
    // Also after a failed link: the candidate may be saved. Jobs show the number of candidates,
    // and a new CV makes any open link to the old one stale.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.candidates(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.applications(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.cvUrls(customerId) });
    },
  });
}

export function useDeleteCandidate(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCandidate(customerId!, id),
    // The candidate's cards go too, and jobs show the number of candidates. Also after a failure:
    // a candidate already deleted in another tab must leave the list.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.candidates(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.applications(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) });
    },
  });
}
