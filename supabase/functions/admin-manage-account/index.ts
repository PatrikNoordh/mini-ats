// admin-manage-account: an admin edits, deletes, restores or deletes for good another account.
// A delete is kept for 30 days (ATS-27): the account is banned and marked deleted, its data stays.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import { createHandler, type Account, type Caller, type Update } from "./handler.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

// Supabase provides these secrets to every Edge Function. The service role key never leaves here.
const supabaseUrl = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

/** Long enough to never run out during the 30 days; restoring lifts it. */
const BAN_WHILE_DELETED = "876000h";
const NO_BAN = "none";

const noSession = { persistSession: false, autoRefreshToken: false };

/** Reads as the caller, so RLS and is_admin() answer for the caller (security rule 2). */
function asCaller(authorization: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: noSession,
  });
}

/** Only for the account changes this function exists for. */
const admin = () => createClient(supabaseUrl, serviceRoleKey, { auth: noSession });

async function getCaller(authorization: string): Promise<Caller> {
  const caller = asCaller(authorization);
  const { data: isAdmin, error, status } = await caller.rpc("is_admin");
  if (error) {
    if (status === 401) return { kind: "invalid_token" };
    throw error;
  }
  if (isAdmin !== true) return { kind: "not_admin" };
  const { data, error: userError } = await caller.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (userError || !data.user) return { kind: "invalid_token" };
  return { kind: "admin", id: data.user.id };
}

async function getAccount(authorization: string, id: string): Promise<Account | null> {
  const { data, error } = await asCaller(authorization)
    .from("profiles")
    .select("id, role, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data.role !== "admin" && data.role !== "customer")) return null;
  return { id: data.id, role: data.role, deleted: data.deleted_at !== null };
}

async function countActiveAdmins(authorization: string): Promise<number> {
  const { count, error } = await asCaller(authorization)
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function updateAccount(update: Update): Promise<{ error: "email_exists" } | null> {
  const service = admin();
  const { error } = await service.auth.admin.updateUserById(update.id, {
    email: update.email,
    email_confirm: true,
    ...(update.password ? { password: update.password } : {}),
    user_metadata: { full_name: update.full_name, company_name: update.company_name },
    // The role trigger (ATS-28) copies this to profiles.role; it is set below too, at once.
    app_metadata: { role: update.role },
  });
  if (error) {
    if (error.code === "email_exists") return { error: "email_exists" };
    throw error;
  }
  const profile = await service
    .from("profiles")
    .update({
      full_name: update.full_name,
      company_name: update.company_name,
      email: update.email,
      role: update.role,
    })
    .eq("id", update.id);
  if (profile.error) throw profile.error;
  return null;
}

/** Banned first: if marking it then fails, the account is blocked rather than left open. */
async function softDelete(id: string): Promise<void> {
  const service = admin();
  const ban = await service.auth.admin.updateUserById(id, { ban_duration: BAN_WHILE_DELETED });
  if (ban.error) throw ban.error;
  const mark = await service
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (mark.error) throw mark.error;
}

async function restore(id: string): Promise<void> {
  const service = admin();
  const unban = await service.auth.admin.updateUserById(id, { ban_duration: NO_BAN });
  if (unban.error) throw unban.error;
  const unmark = await service.from("profiles").update({ deleted_at: null }).eq("id", id);
  if (unmark.error) throw unmark.error;
}

/** The Auth user goes, and the cascades remove the profile and all its data. */
async function deleteNow(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw error;
}

Deno.serve(
  createHandler({
    getCaller,
    getAccount,
    countActiveAdmins,
    updateAccount,
    softDelete,
    restore,
    deleteNow,
  }),
);
