// Deleting a company for good (ATS-46), shared by admin-manage-company ("delete for good") and the
// nightly purge-deleted-accounts. The database and Storage share no transaction, so the steps run
// in the order that leaves the least behind if one fails, and a new run finishes what is left:
//   1. the CV folder, named after the company id: if a later step fails, only files of a company
//      already deleted are gone, and its cv_path values point at nothing until the next run;
//   2. the members' logins: the cascades remove each profile and membership, never company data;
//   3. the company: the cascades remove its jobs, candidates, cards, assessments and columns.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import { CV_BUCKET, removeCvFolder } from "./cvs.ts";

/** The Supabase actions, passed in so the order can be tested without a project. */
export interface CompanyPurgeDeps {
  removeCvFolder: (companyId: string) => Promise<number>;
  listMembers: (companyId: string) => Promise<string[]>;
  deleteUser: (userId: string) => Promise<void>;
  deleteCompany: (companyId: string) => Promise<void>;
}

/** Deletes the company for good, with its files, its members' logins and all its data. */
export async function purgeCompany(deps: CompanyPurgeDeps, companyId: string): Promise<void> {
  await deps.removeCvFolder(companyId);
  for (const userId of await deps.listMembers(companyId)) await deps.deleteUser(userId);
  await deps.deleteCompany(companyId);
}

/** The actions with the service role: deleting a company is what these functions exist for. */
export function companyPurgeDeps(service: SupabaseClient): CompanyPurgeDeps {
  return {
    removeCvFolder: (companyId) => removeCvFolder(service.storage.from(CV_BUCKET), companyId),
    listMembers: async (companyId) => {
      const { data, error } = await service
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId);
      if (error) throw error;
      return data.map((row) => String(row.user_id));
    },
    deleteUser: async (userId) => {
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    deleteCompany: async (companyId) => {
      const { error } = await service.from("companies").delete().eq("id", companyId);
      if (error) throw error;
    },
  };
}
