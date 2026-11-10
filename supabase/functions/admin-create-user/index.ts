// admin-create-user: an admin creates an admin account, or a customer account as a member of an
// existing company or a new one (ATS-46). Public sign-up is disabled, so this is the only way
// accounts are made (CLAUDE.md, security rule 3).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import {
  createHandler,
  type AuthAccount,
  type Caller,
  type Company,
  type CreateResult,
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

/** Reads with the caller's JWT, so is_admin() answers for the caller (security rule 2). */
async function checkCaller(authorization: string): Promise<Caller> {
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: noSession,
  });
  const { data, error, status } = await caller.rpc("is_admin");
  if (error) {
    if (status === 401) return "invalid_token";
    throw error;
  }
  return data === true ? "admin" : "not_admin";
}

/** Only for the writes this function exists for: the account, its company and its membership. */
const admin = () => createClient(supabaseUrl, serviceRoleKey, { auth: noSession });

/** Read as the caller, so RLS answers for the caller. */
async function getCompany(authorization: string, id: string): Promise<Company | null> {
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: noSession,
  });
  const { data, error } = await caller
    .from("companies")
    .select("id, name, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name, deleted: data.deleted_at !== null } : null;
}

async function createCompany(name: string): Promise<string> {
  const { data, error } = await admin().from("companies").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function deleteCompany(id: string): Promise<void> {
  const { error } = await admin().from("companies").delete().eq("id", id);
  if (error) throw error;
}

async function createUser(account: AuthAccount): Promise<CreateResult> {
  const { data, error } = await admin().auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    // The profile triggers copy these: name and company from user_metadata at insert, and the
    // role from app_metadata (server only), which Auth sets in an update right after (ATS-28).
    user_metadata: { full_name: account.full_name, company_name: account.company_name },
    app_metadata: { role: account.role },
  });
  if (error) {
    if (error.code === "email_exists") return { error: "email_exists" };
    throw error;
  }
  return { id: data.user.id };
}

async function addMember(companyId: string, userId: string): Promise<void> {
  const { error } = await admin()
    .from("company_members")
    .insert({ company_id: companyId, user_id: userId });
  if (error) throw error;
}

async function deleteUser(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw error;
}

Deno.serve(
  createHandler({
    checkCaller,
    getCompany,
    createCompany,
    deleteCompany,
    createUser,
    addMember,
    deleteUser,
  }),
);
