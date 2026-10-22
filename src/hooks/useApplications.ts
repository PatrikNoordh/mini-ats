import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useErrorToast } from "@/hooks/useErrorToast";
import {
  addApplication,
  listApplications,
  moveApplication,
  unlinkCandidate,
} from "@/lib/api/applications";
import { queryKeys, withCardMoved, withCardRestored } from "@/lib/stages";
import type { Application, Stage } from "@/types";

export function useApplications(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.applications(customerId),
    queryFn: () => listApplications(customerId!),
    enabled: !!customerId,
  });
}

export function useMoveApplication(customerId: string | null) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const qc = useQueryClient();
  const key = queryKeys.applications(customerId);
  const mutationKey = ["moveApplication", customerId] as const;
  return useMutation({
    mutationKey,
    // Already the app's default for mutations (src/lib/query-client.ts). Kept here because the
    // board shows the card moved at once: a paused move would leave it in the wrong column.
    networkMode: "always",
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      moveApplication(customerId!, id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Application[]>(key)?.find((a) => a.id === id);
      qc.setQueryData<Application[]>(key, (old) => old && withCardMoved(old, id, stage));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      const previous = ctx?.previous;
      if (previous) {
        qc.setQueryData<Application[]>(key, (old) => old && withCardRestored(old, previous));
      }
      errorToast(t("pipeline.moveFailed"), err);
    },
    // Refetch once the last of several quick moves is done, so an earlier answer never shows a
    // card back in its old column while a later move is still on its way.
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) === 1) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useAddApplication(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ candidateId, jobId }: { candidateId: string; jobId: string }) =>
      addApplication(candidateId, jobId),
    // Also after already_linked: the cache missed a link, so the job list must refresh.
    // The jobs list shows the number of candidates per job.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.applications(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) });
    },
  });
}

/** Removes one card: the candidate's link to one job, with any assessment of it (ATS-30). */
export function useRemoveApplication(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ candidateId, jobId }: { candidateId: string; jobId: string }) =>
      unlinkCandidate(customerId!, candidateId, [jobId]),
    // Also after a failure: the card may already be gone in another tab. Jobs and candidates show
    // how many links they have.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.applications(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.candidates(customerId) });
    },
  });
}
