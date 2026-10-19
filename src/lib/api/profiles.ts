import type { Profile, Role } from "@/types";
import { AppError } from "@/lib/errors";
import { clone, db, delay, uid } from "./mockStore";

export async function listProfiles(): Promise<Profile[]> {
  await delay();
  return clone(db().profiles);
}

export async function getProfile(id: string): Promise<Profile | null> {
  await delay();
  const p = db().profiles.find((x) => x.id === id);
  return p ? clone(p) : null;
}

/** Mock credential check. Replaced by Supabase Auth later. */
export async function verifyCredentials(email: string, password: string): Promise<Profile | null> {
  await delay();
  const s = db();
  const p = s.profiles.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!p || s.passwords[p.id] !== password) return null;
  return clone(p);
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
