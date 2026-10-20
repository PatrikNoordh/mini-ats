import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { addApplication, listApplications, moveApplication } from "@/lib/api/applications";
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
  const qc = useQueryClient();
  const key = queryKeys.applications(customerId);
  const mutationKey = ["moveApplication", customerId] as const;
  return useMutation({
    mutationKey,
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      moveApplication(customerId!, id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Application[]>(key)?.find((a) => a.id === id);
      qc.setQueryData<Application[]>(key, (old) => old && withCardMoved(old, id, stage));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      const previous = ctx?.previous;
      if (previous) {
        qc.setQueryData<Application[]>(key, (old) => old && withCardRestored(old, previous));
      }
      toast.error(t("pipeline.moveFailed"));
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
