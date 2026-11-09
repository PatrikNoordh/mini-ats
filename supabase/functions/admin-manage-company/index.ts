// admin-manage-company: an admin creates, renames, deletes, restores or deletes for good a company
// (ATS-46). A delete is kept for 30 days: the company is marked deleted, which hides it and its
// data from every member at once, and its members' logins are banned. The nightly purge, or
// "delete for good", then removes it (../_shared/company-purge.ts).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import { companyPurgeDeps, purgeCompany } from "../_shared/company-purge.ts";
import { setBanned } from "../_shared/logins.ts";
import { createHandler, type Caller, type Company } from "./handler.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

// Supabase provides these secrets to every Edge Function. The service role key never leaves here.
const supabaseUrl = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

const noSession = { persistSession: false, autoRefreshToken: false };

/** Reads as the caller, so RLS and is_admin() answer for the caller (security rule 2). */
function asCaller(authorization: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: noSession,
  });
}

/** Only for the company changes this function exists for. */
const admin = () => createClient(supabaseUrl, serviceRoleKey, { auth: noSession });

async function checkCaller(authorization: string): Promise<Caller> {
  const { data, error, status } = await asCaller(authorization).rpc("is_admin");
  if (error) {
    if (status === 401) return "invalid_token";
    throw error;
  }
  return data === true ? "admin" : "not_admin";
}

async function getCompany(authorization: string, id: string): Promise<Company | null> {
  const { data, error } = await asCaller(authorization)
    .from("companies")
    .select("id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, deleted: data.deleted_at !== null } : null;
}

async function create(name: string): Promise<string> {
  const { data, error } = await admin().from("companies").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function setCompany(
  service: SupabaseClient,
  id: string,
  values: { name: string } | { deleted_at: string | null },
): Promise<void> {
  const { error } = await service.from("companies").update(values).eq("id", id);
  if (error) throw error;
}

/** The company's members, and whether each one's own account is deleted. */
async function members(
  service: SupabaseClient,
  id: string,
): Promise<{ userId: string; deleted: boolean }[]> {
  const { data, error } = await service
    .from("company_members")
    .select("user_id, profiles(deleted_at)")
    .eq("company_id", id);
  if (error) throw error;
  return data.map((row) => {
    const profile: unknown = row.profiles;
    const deleted =
      typeof profile === "object" &&
      profile !== null &&
      "deleted_at" in profile &&
      profile.deleted_at !== null;
    return { userId: String(row.user_id), deleted };
  });
}

/**
 * Logs what could not be undone, with the error that caused the undo; the caller still reports
 * that first error (as in admin-manage-account, ATS-32).
 */
async function undo(action: () => Promise<void>, cause: unknown): Promise<void> {
  try {
    await action();
  } catch (undoError) {
    console.error("admin-manage-company: the undo failed too", { cause, undoError });
  }
}

/**
 * Marked first: a member of a deleted company gets no rows at once (current_company_id()). The
 * bans then block their logins. If a ban fails, the bans made so far and the mark are undone.
 */
async function softDelete(id: string): Promise<void> {
  const service = admin();
  await setCompany(service, id, { deleted_at: new Date().toISOString() });
  const banned: string[] = [];
  try {
    for (const member of await members(service, id)) {
      if (member.deleted) continue; // Already banned as a deleted account.
      await setBanned(service, member.userId, true);
      banned.push(member.userId);
    }
  } catch (error) {
    await undo(async () => {
      for (const userId of banned) await setBanned(service, userId, false);
      await setCompany(service, id, { deleted_at: null });
    }, error);
    throw error;
  }
}

/**
 * The bans are lifted first and the mark last, so a failure leaves the company deleted and a new
 * restore finishes the work. A member deleted on their own stays banned.
 */
async function restore(id: string): Promise<void> {
  const service = admin();
  for (const member of await members(service, id)) {
    if (!member.deleted) await setBanned(service, member.userId, false);
  }
  await setCompany(service, id, { deleted_at: null });
}

Deno.serve(
  createHandler({
    checkCaller,
    getCompany,
    create,
    rename: (id, name) => setCompany(admin(), id, { name }),
    softDelete,
    restore,
    deleteNow: (id) => purgeCompany(companyPurgeDeps(admin()), id),
  }),
);
