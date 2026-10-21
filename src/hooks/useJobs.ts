import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createJob, listJobs, setJobStatus, updateJob } from "@/lib/api/jobs";
import { queryKeys } from "@/lib/stages";
import type { JobInput } from "@/lib/validation";
import type { JobStatus } from "@/types";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.openJobCounts() });
    },
  });
}

export function useUpdateJob(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: JobInput }) =>
      updateJob(customerId!, id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) }),
  });
}

export function useSetJobStatus(customerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobStatus }) =>
      setJobStatus(customerId!, id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.openJobCounts() });
    },
  });
}
