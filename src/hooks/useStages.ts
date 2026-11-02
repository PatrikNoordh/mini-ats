import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addStage,
  listStages,
  removeStage,
  renameStage,
  resetStages,
  setStageColour,
} from "@/lib/api/pipelineStages";
import { queryKeys } from "@/lib/stages";
import type { StageColour } from "@/types";

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
