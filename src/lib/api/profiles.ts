import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Profile, Role } from "@/types";
import { roleSchema } from "@/lib/validation";
import { invokeFunction } from "./functions";

/**
 * The profile with its membership and the company's name (ATS-45). `profiles.company_name` is not
 * read: the name comes from `companies.name`. A user is a member of at most one company.
 */
const PROFILE_COLUMNS =
  "id, role, full_name, email, created_at, deleted_at, company_members(company_id, companies(name))";

const profileRowSchema = z.object({
  id: z.string(),
  role: roleSchema,
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
  // RLS shows a customer user their membership only while they and the company are active, and
  // every membership to an admin.
  company_members: z
    .object({ company_id: z.string(), companies: z.object({ name: z.string() }).nullable() })
    .nullable(),
});

/** A `profiles` row as the app's Profile. Throws on a role the app does not know. */
export function parseProfileRow(row: unknown): Profile {
  const p = profileRowSchema.parse(row);
  return {
    id: p.id,
    role: p.role,
    full_name: p.full_name ?? "",
    company_id: p.company_members?.company_id ?? null,
    company_name: p.company_members?.companies?.name ?? "",
    email: p.email ?? "",
    created_at: p.created_at,
    deleted_at: p.deleted_at,
  };
}

/** Every account, newest first. RLS returns all rows to an admin and only their own to a customer. */
export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(parseProfileRow);
}

// `jobs(count)` comes back as a list with one row: [{ count: n }].
const openJobCountRowSchema = z.object({
  id: z.string(),
  jobs: z.array(z.object({ count: z.number() })),
});

/** Open-job count rows as a map from customer id to count. */
export function parseOpenJobCounts(rows: unknown): Map<string, number> {
  const parsed = z.array(openJobCountRowSchema).parse(rows);
  return new Map(parsed.map((r) => [r.id, r.jobs[0]?.count ?? 0]));
}

/**
 * The number of open jobs of every customer, in one request, for the admin's customer chooser.
 * Only the counts come back, not the jobs. RLS returns every company to an admin. Counted per
 * company, since jobs reference companies, not profiles (ATS-44); a customer's id is its company's.
 */
export async function countOpenJobsByCustomer(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, jobs(count)")
    .eq("jobs.status", "open");
  if (error) throw error;
  return parseOpenJobCounts(data);
}

/**
 * The signed-in user's own profile from the database. `profiles.role` is the role that counts
 * (CLAUDE.md, security rule 4). RLS only returns the user's own row, or any row for an admin.
 */
export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? parseProfileRow(data) : null;
}

/**
 * A new account. A customer joins an existing company (`company_id`) or a new one
 * (`company_name`); an admin has neither (ATS-46).
 */
export interface CreateProfileInput {
  role: Role;
  full_name: string;
  email: string;
  password: string;
  company_id?: string;
  company_name?: string;
}

const createdSchema = z.object({ id: z.string() });

/**
 * Creates an account through the admin-create-user Edge Function, which checks that the caller
 * is an admin, and adds a customer to their company. The profile is made by the database trigger.
 * Returns the new account's id.
 */
export async function createProfile(input: CreateProfileInput): Promise<string> {
  return createdSchema.parse(await invokeFunction("admin-create-user", input)).id;
}

export interface UpdateProfileInput {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  /** Left out to keep the password. */
  password?: string;
  /** Moves the user to this company, or out of theirs for null. Left out to keep it. */
  company_id?: string | null;
}

/**
 * Account changes go through the admin-manage-account Edge Function, which checks that the caller
 * is an admin and never lets an admin delete or demote itself or the last admin.
 */
export async function updateProfile({ password, ...input }: UpdateProfileInput): Promise<void> {
  await invokeFunction("admin-manage-account", {
    action: "update",
    ...input,
    ...(password ? { password } : {}),
  });
}

/** Hides the account and blocks its login. Its data is kept, and it can be restored. */
export async function deleteProfile(id: string): Promise<void> {
  await invokeFunction("admin-manage-account", { action: "delete", id });
}

export async function restoreProfile(id: string): Promise<void> {
  await invokeFunction("admin-manage-account", { action: "restore", id });
}

/**
 * Deletes a deleted account for good before its 30 days are up: the login and the profile. The
 * company's data stays with the company (ATS-44).
 */
export async function deleteProfileNow(id: string): Promise<void> {
  await invokeFunction("admin-manage-account", { action: "delete_now", id });
}
