// admin-manage-account: an admin edits, deletes, restores or deletes for good another account.
// A delete is kept for 30 days (ATS-27): the account is banned and marked deleted, its data stays.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import {
  createHandler,
  type Account,
  type Caller,
  type RemovalRefusal,
  type Update,
} from "./handler.ts";

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

const REMOVAL_REFUSALS: readonly RemovalRefusal[] = [
  "account_not_found",
  "account_deleted",
  "last_admin",
];

/**
 * Marks the profile deleted or demotes it, in one locked database call that refuses to remove
 * the last active admin (ATS-33). Runs before the Auth change, which cannot join that
 * transaction, and is undone if the Auth change fails.
 */
async function softDeleteOrDemote(
  service: SupabaseClient,
  id: string,
  change: "soft_delete" | "demote",
): Promise<RemovalRefusal | null> {
  const { error } = await service.rpc("soft_delete_or_demote_account", {
    account_id: id,
    change,
  });
  if (!error) return null;
  const refusal = REMOVAL_REFUSALS.find((code) => code === error.message);
  if (refusal) return refusal;
  throw error;
}

async function setProfile(
  service: SupabaseClient,
  id: string,
  values: { role: "admin" } | { deleted_at: string | null },
): Promise<void> {
  const { error } = await service.from("profiles").update(values).eq("id", id);
  if (error) throw error;
}

async function updateAccount(
  update: Update,
  demote: boolean,
): Promise<{ error: "email_exists" | RemovalRefusal } | null> {
  const service = admin();
  if (demote) {
    const refusal = await softDeleteOrDemote(service, update.id, "demote");
    if (refusal) return { error: refusal };
  }
  const { error } = await service.auth.admin.updateUserById(update.id, {
    email: update.email,
    email_confirm: true,
    ...(update.password ? { password: update.password } : {}),
    user_metadata: { full_name: update.full_name, company_name: update.company_name },
    // The role trigger (ATS-28) copies this to profiles.role; it is set below too, at once. A
    // demotion has already set it above, under the last-admin lock.
    app_metadata: { role: update.role },
  });
  if (error) {
    if (demote) await setProfile(service, update.id, { role: "admin" });
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

/**
 * Marked first, under the last-admin lock. A marked account already gets no rows and is no
 * admin; the ban then blocks its login. If the ban fails, the mark is undone.
 */
async function softDelete(id: string): Promise<RemovalRefusal | null> {
  const service = admin();
  const refusal = await softDeleteOrDemote(service, id, "soft_delete");
  if (refusal) return refusal;
  const ban = await service.auth.admin.updateUserById(id, { ban_duration: BAN_WHILE_DELETED });
  if (ban.error) {
    await setProfile(service, id, { deleted_at: null });
    throw ban.error;
  }
  return null;
}

async function restore(id: string): Promise<void> {
  const service = admin();
  const unban = await service.auth.admin.updateUserById(id, { ban_duration: NO_BAN });
  if (unban.error) throw unban.error;
  await setProfile(service, id, { deleted_at: null });
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
    updateAccount,
    softDelete,
    restore,
    deleteNow,
  }),
);
