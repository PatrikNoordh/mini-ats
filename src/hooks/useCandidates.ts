import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCandidate,
  listCandidates,
  updateCandidate,
  type CandidateInput,
} from "@/lib/api/candidates";
import { queryKeys } from "@/lib/stages";

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
  jobIds: string[];
}

export function useSaveCandidate(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, jobIds }: SaveCandidateVars) =>
      id
        ? updateCandidate(customerId!, id, input, jobIds)
        : createCandidate(customerId!, input, jobIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.candidates(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.applications(customerId) });
    },
  });
}
