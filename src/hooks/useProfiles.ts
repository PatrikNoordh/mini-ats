import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  countOpenJobsByCustomer,
  createProfile,
  deleteProfile,
  deleteProfileNow,
  listProfiles,
  restoreProfile,
  updateProfile,
  type CreateProfileInput,
  type UpdateProfileInput,
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
    // A new customer needs a count too, or its chooser card says the count is unavailable.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles() });
      qc.invalidateQueries({ queryKey: queryKeys.openJobCounts() });
    },
  });
}

/** One account change through admin-manage-account. The lists and the chooser's counts follow. */
function useAccountMutation<T>(mutationFn: (input: T) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles() });
      qc.invalidateQueries({ queryKey: queryKeys.openJobCounts() });
    },
  });
}

export const useUpdateProfile = () =>
  useAccountMutation((input: UpdateProfileInput) => updateProfile(input));
export const useDeleteProfile = () => useAccountMutation((id: string) => deleteProfile(id));
export const useRestoreProfile = () => useAccountMutation((id: string) => restoreProfile(id));
export const useDeleteProfileNow = () => useAccountMutation((id: string) => deleteProfileNow(id));
