import { useQuery } from "@tanstack/react-query";
import { getCompany, listCompanies } from "@/lib/api/companies";
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
