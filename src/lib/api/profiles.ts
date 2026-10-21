import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Profile, Role } from "@/types";
import { roleSchema } from "@/lib/validation";
import { invokeFunction } from "./functions";

const PROFILE_COLUMNS = "id, role, full_name, company_name, email, created_at";

const profileRowSchema = z.object({
  id: z.string(),
  role: roleSchema,
  full_name: z.string().nullable(),
  company_name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.string(),
});

/** A `profiles` row as the app's Profile. Throws on a role the app does not know. */
export function parseProfileRow(row: unknown): Profile {
  const p = profileRowSchema.parse(row);
  return {
    id: p.id,
    role: p.role,
    full_name: p.full_name ?? "",
    company_name: p.company_name ?? "",
    email: p.email ?? "",
    created_at: p.created_at,
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
 * Only the counts come back, not the jobs. RLS returns every customer to an admin.
 */
export async function countOpenJobsByCustomer(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, jobs(count)")
    .eq("role", "customer")
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

export interface CreateProfileInput {
  role: Role;
  full_name: string;
  company_name: string;
  email: string;
  password: string;
}

const createdSchema = z.object({ id: z.string() });

/**
 * Creates an account through the admin-create-user Edge Function, which checks that the caller
 * is an admin. The profile is made by the database trigger. Returns the new account's id.
 */
export async function createProfile(input: CreateProfileInput): Promise<string> {
  return createdSchema.parse(await invokeFunction("admin-create-user", input)).id;
}
