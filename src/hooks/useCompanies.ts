import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompany,
  deleteCompany,
  deleteCompanyNow,
  getCompany,
  listCompanies,
  renameCompany,
  restoreCompany,
} from "@/lib/api/companies";
import { queryKeys } from "@/lib/stages";

/** Every company. Admin only: a customer user reads their own with useCompany. */
export function useCompanies(enabled = true) {
  return useQuery({ queryKey: queryKeys.companies(), queryFn: listCompanies, enabled });
}

/** One company by id; null when it is gone or the caller may not see it. */
export function useCompany(companyId: string | null) {
  return useQuery({
    queryKey: queryKeys.company(companyId),
    queryFn: () => getCompany(companyId!),
    enabled: !!companyId,
  });
}

/**
 * One company change through admin-manage-company (ATS-46). The companies, the accounts (a delete
 * for good removes the members' accounts) and the chooser's counts follow.
 */
function useCompanyMutation<T, R>(mutationFn: (input: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.companies() });
      qc.invalidateQueries({ queryKey: queryKeys.profiles() });
      qc.invalidateQueries({ queryKey: queryKeys.openJobCounts() });
    },
  });
}

export const useCreateCompany = () => useCompanyMutation((name: string) => createCompany(name));
export const useRenameCompany = () =>
  useCompanyMutation(({ id, name }: { id: string; name: string }) => renameCompany(id, name));
export const useDeleteCompany = () => useCompanyMutation((id: string) => deleteCompany(id));
export const useRestoreCompany = () => useCompanyMutation((id: string) => restoreCompany(id));
export const useDeleteCompanyNow = () => useCompanyMutation((id: string) => deleteCompanyNow(id));
