import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/types";
import { invokeFunction } from "./functions";

const COMPANY_COLUMNS = "id, name, created_at, deleted_at";

const companyRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
});

/** A `companies` row as the app's Company. */
export function parseCompanyRow(row: unknown): Company {
  return companyRowSchema.parse(row);
}

/**
 * Every company, newest first, for the admin's chooser and picker. RLS returns every company to an
 * admin, and only their own active company to a customer user.
 */
export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(parseCompanyRow);
}

/**
 * One company, or null when the caller may not see it. For a customer user, RLS shows their own
 * company only while both the user and the company are active (`current_company_id()`), so null
 * means they no longer have an active company.
 */
export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? parseCompanyRow(data) : null;
}

const createdSchema = z.object({ id: z.string() });

/**
 * Company changes go through the admin-manage-company Edge Function, which checks that the caller
 * is an admin (ATS-46). Clients only read companies (security rule 3).
 */
export async function createCompany(name: string): Promise<string> {
  return createdSchema.parse(
    await invokeFunction("admin-manage-company", { action: "create", name }),
  ).id;
}

export async function renameCompany(id: string, name: string): Promise<void> {
  await invokeFunction("admin-manage-company", { action: "rename", id, name });
}

/** Hides the company and its data from its members and bans their logins, for 30 days. */
export async function deleteCompany(id: string): Promise<void> {
  await invokeFunction("admin-manage-company", { action: "delete", id });
}

/** Brings the company back, and its members who are not deleted themselves. */
export async function restoreCompany(id: string): Promise<void> {
  await invokeFunction("admin-manage-company", { action: "restore", id });
}

/** Deletes a deleted company for good: its CVs, its members' accounts and all its data. */
export async function deleteCompanyNow(id: string): Promise<void> {
  await invokeFunction("admin-manage-company", { action: "delete_now", id });
}
