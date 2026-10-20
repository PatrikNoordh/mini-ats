// admin-create-user: an admin creates an admin or customer account.
// Public sign-up is disabled, so this is the only way accounts are made (CLAUDE.md, security rule 3).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import { createHandler, type Caller, type CreateResult, type NewAccount } from "./handler.ts";

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

/** The one privileged action: create the user with the service role key. */
async function createUser(account: NewAccount): Promise<CreateResult> {
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: noSession });
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    // The profile trigger copies these at insert: the role from app_metadata (server only),
    // name and company from user_metadata.
    user_metadata: { full_name: account.full_name, company_name: account.company_name },
    app_metadata: { role: account.role },
  });
  if (error) {
    if (error.code === "email_exists") return { error: "email_exists" };
    throw error;
  }
  return { id: data.user.id };
}

Deno.serve(createHandler({ checkCaller, createUser }));
