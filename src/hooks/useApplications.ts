import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { addApplication, listApplications, moveApplication } from "@/lib/api/applications";
import { queryKeys } from "@/lib/stages";
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
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      moveApplication(customerId!, id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Application[]>(key);
      const now = new Date().toISOString();
      qc.setQueryData<Application[]>(key, (old) =>
        old?.map((a) =>
          a.id === id
            ? {
                ...a,
                stage,
                position: Number.MAX_SAFE_INTEGER,
                stage_changed_at: now,
                updated_at: now,
              }
            : a,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(t("pipeline.moveFailed"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
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
