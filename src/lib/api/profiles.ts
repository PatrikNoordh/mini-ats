import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Profile, Role } from "@/types";
import { AppError } from "@/lib/errors";
import { clone, db, delay, uid } from "./mockStore";

const profileRowSchema = z.object({
  id: z.string(),
  role: z.enum(["admin", "customer"]),
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

export async function listProfiles(): Promise<Profile[]> {
  await delay();
  return clone(db().profiles);
}

/**
 * The signed-in user's own profile from the database. `profiles.role` is the role that counts
 * (CLAUDE.md, security rule 4). RLS only returns the user's own row, or any row for an admin.
 */
export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, company_name, email, created_at")
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

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  await delay();
  const s = db();
  if (s.profiles.some((p) => p.email.toLowerCase() === input.email.toLowerCase())) {
    throw new AppError("email_exists");
  }
  const profile: Profile = {
    id: uid("p"),
    role: input.role,
    full_name: input.full_name,
    company_name: input.company_name,
    email: input.email,
    created_at: new Date().toISOString(),
  };
  s.profiles.push(profile);
  s.passwords[profile.id] = input.password;
  return clone(profile);
}
