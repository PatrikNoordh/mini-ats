import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  countOpenJobsByCustomer,
  createProfile,
  listProfiles,
  type CreateProfileInput,
} from "@/lib/api/profiles";
import { queryKeys } from "@/lib/stages";

export function useProfiles(enabled = true) {
  return useQuery({ queryKey: queryKeys.profiles(), queryFn: listProfiles, enabled });
}

export function useOpenJobCounts(enabled = true) {
  return useQuery({
    queryKey: queryKeys.openJobCounts(),
    queryFn: countOpenJobsByCustomer,
    enabled,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProfileInput) => createProfile(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profiles() }),
  });
}
