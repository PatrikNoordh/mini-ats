import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createJob, listJobs, updateJob, type JobInput } from "@/lib/api/jobs";
import { queryKeys } from "@/lib/stages";

export function useJobs(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.jobs(customerId),
    queryFn: () => listJobs(customerId!),
    enabled: !!customerId,
  });
}

export function useCreateJob(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: JobInput) => createJob(customerId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) }),
  });
}

export function useUpdateJob(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<JobInput> }) =>
      updateJob(customerId!, id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) }),
  });
}
