import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useErrorToast } from "@/hooks/useErrorToast";
import {
  addStage,
  listStages,
  removeStage,
  renameStage,
  reorderStages,
  resetStages,
  setStageColour,
} from "@/lib/api/pipelineStages";
import { queryKeys, withStagesOrdered } from "@/lib/stages";
import type { PipelineStage, StageColour } from "@/types";

/** The active customer's board columns, in board order (ATS-39). */
export function useStages(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.stages(customerId),
    queryFn: () => listStages(customerId!),
    enabled: !!customerId,
  });
}

/**
 * A change to the customer's columns (ATS-40). The columns are read again afterwards, also after a
 * failure: another tab may have changed them, which is often why it failed.
 */
function useStageMutation<V>(customerId: string | null, mutationFn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.stages(customerId) }),
  });
}

export function useRenameStage(customerId: string | null) {
  return useStageMutation(customerId, ({ id, name }: { id: string; name: string }) =>
    renameStage(customerId!, id, name),
  );
}

export function useSetStageColour(customerId: string | null) {
  return useStageMutation(customerId, ({ id, colour }: { id: string; colour: StageColour }) =>
    setStageColour(customerId!, id, colour),
  );
}

export function useRemoveStage(customerId: string | null) {
  return useStageMutation(customerId, (id: string) => removeStage(customerId!, id));
}

export function useAddStage(customerId: string | null) {
  return useStageMutation(customerId, ({ name, colour }: { name: string; colour: StageColour }) =>
    addStage(customerId!, name, colour),
  );
}

export function useResetStages(customerId: string | null) {
  return useStageMutation(customerId, () => resetStages(customerId!));
}

/**
 * Puts the columns in a new order (ATS-41). The board shows the new order at once and puts the old
 * one back, with a toast, if the save fails. The columns are read again once the last of several
 * quick reorders is done, so an earlier answer never shows an old order meanwhile.
 */
export function useReorderStages(customerId: string | null) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const qc = useQueryClient();
  const key = queryKeys.stages(customerId);
  const mutationKey = ["reorderStages", customerId] as const;
  return useMutation({
    mutationKey,
    mutationFn: (stageIds: readonly string[]) => reorderStages(customerId!, stageIds),
    onMutate: async (stageIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PipelineStage[]>(key);
      qc.setQueryData<PipelineStage[]>(key, (old) => old && withStagesOrdered(old, stageIds));
      return { previous };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      errorToast(t("pipeline.reorderFailed"), err);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) === 1) qc.invalidateQueries({ queryKey: key });
    },
  });
}
