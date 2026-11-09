// admin-manage-account: an admin edits, deletes, restores or deletes for good another account, and
// moves a user between companies (ATS-46). A delete is kept for 30 days (ATS-27): the account is
// banned and marked deleted. Its company and the company's data are never touched.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import { inDeletedCompany, setBanned } from "../_shared/logins.ts";
import {
  createHandler,
  type Account,
  type Caller,
  type Company,
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

async function getCompany(authorization: string, id: string): Promise<Company | null> {
  const { data, error } = await asCaller(authorization)
    .from("companies")
    .select("id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, deleted: data.deleted_at !== null } : null;
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

/**
 * Undoes a profile write after the Auth call it belonged to failed. If the undo fails too, that is
 * logged with the Auth error that caused it, and the caller still reports the Auth error, which is
 * what went wrong first (ATS-32).
 */
async function undo(action: () => Promise<void>, cause: unknown): Promise<void> {
  try {
    await action();
  } catch (undoError) {
    console.error("admin-manage-account: the undo failed too", { cause, undoError });
  }
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
  // company_name only comes from the accounts page on main, which still edits the old column.
  const companyName = update.company_name ? { company_name: update.company_name } : {};
  const { error } = await service.auth.admin.updateUserById(update.id, {
    email: update.email,
    email_confirm: true,
    ...(update.password ? { password: update.password } : {}),
    user_metadata: { full_name: update.full_name, ...companyName },
    // The role trigger (ATS-28) copies this to profiles.role; it is set below too, at once. A
    // demotion has already set it above, under the last-admin lock.
    app_metadata: { role: update.role },
  });
  if (error) {
    if (demote) await undo(() => setProfile(service, update.id, { role: "admin" }), error);
    if (error.code === "email_exists") return { error: "email_exists" };
    throw error;
  }
  const profile = await service
    .from("profiles")
    .update({ full_name: update.full_name, ...companyName, email: update.email, role: update.role })
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
  try {
    await setBanned(service, id, true);
  } catch (error) {
    await undo(() => setProfile(service, id, { deleted_at: null }), error);
    throw error;
  }
  return null;
}

/**
 * The ban is lifted first and the mark last, so a failure leaves the account deleted and a new
 * restore finishes the work. A member of a deleted company stays banned: restoring the company
 * opens their login (ATS-46).
 */
async function restore(id: string): Promise<void> {
  const service = admin();
  if (!(await inDeletedCompany(service, id))) await setBanned(service, id, false);
  await setProfile(service, id, { deleted_at: null });
}

/**
 * One membership per user (user_id is unique), so a move replaces the row. The account is active
 * and the company too (checked by the handler), so the login opens: it was banned if the user's
 * old company was deleted.
 */
async function setCompany(userId: string, companyId: string | null): Promise<void> {
  const service = admin();
  const { error } = companyId
    ? await service
        .from("company_members")
        .upsert({ company_id: companyId, user_id: userId }, { onConflict: "user_id" })
    : await service.from("company_members").delete().eq("user_id", userId);
  if (error) throw error;
  await setBanned(service, userId, false);
}

/**
 * Deletes the Auth user, and the cascades remove the profile and the membership. The data and the
 * CV folder belong to the company, which stays (ATS-44); only deleting the company removes them.
 */
async function deleteNow(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw error;
}

Deno.serve(
  createHandler({
    getCaller,
    getAccount,
    getCompany,
    updateAccount,
    setCompany,
    softDelete,
    restore,
    deleteNow,
  }),
);
