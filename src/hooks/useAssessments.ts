import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assessCv, listAssessments } from "@/lib/api/assessments";
import type { Language } from "@/lib/language";
import { queryKeys } from "@/lib/stages";

/** The assessments of one candidate's applications, newest first. */
export function useAssessments(
  customerId: string | null,
  candidateId: string | null,
  applicationIds: readonly string[],
) {
  return useQuery({
    // The ids are part of the key, so a card added or removed in the panel refetches.
    queryKey: [...queryKeys.assessments(customerId, candidateId), [...applicationIds].sort()],
    queryFn: () => listAssessments(customerId!, applicationIds),
    enabled: !!customerId && !!candidateId,
  });
}

export function useAssessCv(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, language }: { applicationId: string; language: Language }) =>
      assessCv(applicationId, language),
    // Also after a failure: a slow answer may have been saved after the request gave up.
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.assessmentsAll(customerId) }),
  });
}
