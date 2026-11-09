// purge-deleted-accounts: deletes for good the accounts deleted more than 30 days ago (ATS-27).
// Called once a night by pg_cron through pg_net, never by the app:
// supabase/migrations/20261023200000_purge_with_cv_files.sql. Since ATS-44 it removes only the
// login: the CV files belong to the company, and go with it (ATS-46).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import { createHandler } from "./handler.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

// Supabase provides the first two to every Edge Function. PURGE_CRON_SECRET is set with
// `npx supabase secrets set`, the same value as purge_cron_secret in Vault.
const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cronSecret = env("PURGE_CRON_SECRET");

async function listDue(): Promise<string[]> {
  const { data, error } = await service.rpc("accounts_due_for_purge");
  if (error) throw error;
  const ids: unknown[] = Array.isArray(data) ? data : [];
  return ids.filter((id): id is string => typeof id === "string");
}

async function deleteUser(id: string): Promise<void> {
  const { error } = await service.auth.admin.deleteUser(id);
  if (error) throw error;
}

Deno.serve(createHandler(cronSecret, { listDue, deleteUser }));
