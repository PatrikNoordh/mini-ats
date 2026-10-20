import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { linkCandidate } from "@/lib/api/applications";
import { createCandidate, listCandidates, updateCandidate } from "@/lib/api/candidates";
import { AppError } from "@/lib/errors";
import { queryKeys } from "@/lib/stages";
import type { CandidateInput } from "@/lib/validation";
import type { Candidate } from "@/types";

export function useCandidates(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.candidates(customerId),
    queryFn: () => listCandidates(customerId!),
    enabled: !!customerId,
  });
}

export interface SaveCandidateVars {
  id?: string | undefined;
  input: CandidateInput;
  /** Jobs to link the candidate to. Existing links are kept and never removed here. */
  newJobIds: string[];
}

/**
 * Saves the candidate, then links it to the new jobs. These are two requests: if the links fail,
 * the candidate is already saved, and the error is `links_failed` so the form can say so.
 */
export async function saveCandidate(
  customerId: string,
  { id, input, newJobIds }: SaveCandidateVars,
): Promise<Candidate> {
  const candidate = id
    ? await updateCandidate(customerId, id, input)
    : await createCandidate(customerId, input);
  try {
    await linkCandidate(candidate.id, newJobIds);
  } catch {
    throw new AppError("links_failed");
  }
  return candidate;
}

export function useSaveCandidate(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: SaveCandidateVars) => saveCandidate(customerId!, vars),
    // Also after a failed link: the candidate may be saved. Jobs show the number of candidates.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.candidates(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.applications(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) });
    },
  });
}
