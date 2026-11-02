import { useQuery } from "@tanstack/react-query";
import { listStages } from "@/lib/api/pipelineStages";
import { queryKeys } from "@/lib/stages";

/** The active customer's board columns, in board order (ATS-39). */
export function useStages(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.stages(customerId),
    queryFn: () => listStages(customerId!),
    enabled: !!customerId,
  });
}
