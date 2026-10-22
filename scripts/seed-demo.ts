/// <reference types="node" />
// Seeds the demo accounts and data for the reviewers (ATS-15). Run it from your own terminal:
//
//   npm run seed:demo -- --yes
//
// It reads VITE_SUPABASE_URL from .env.local and SUPABASE_SERVICE_ROLE_KEY from the shell or from
// .env.seed.local. Both files are gitignored. The key never goes in .env.local, the file the app
// reads, and never in the repo.
//
// The accounts are made through the Auth admin API, like admin-create-user, so the profile
// trigger runs. A new account gets the password from DEMO_<KEY>_PASSWORD, or a generated one that
// is printed once. An existing account keeps its password unless one is given. Every run rebuilds
// the jobs, candidates and cards of the demo customers, and touches no other customer's rows.
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DEMO_ACCOUNTS, DEMO_CUSTOMERS, type DemoAccount, type DemoCustomer } from "./demo-data.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Bytes of randomness in a generated password: 24 characters of base64url. */
const PASSWORD_BYTES = 18;
/** Auth's listUsers page size; the project has far fewer users. */
const USERS_PER_PAGE = 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the comment at the top of this script.`);
  return value;
}

/** The ids of the accounts that already exist, by email. */
async function existingUsers(admin: SupabaseClient): Promise<Map<string, string>> {
  const users = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw error;
    for (const user of data.users) if (user.email) users.set(user.email, user.id);
    if (data.users.length < USERS_PER_PAGE) return users;
  }
}

/** Creates the account if it is missing. Returns its id and the password when one was set. */
async function ensureAccount(
  admin: SupabaseClient,
  existing: Map<string, string>,
  account: DemoAccount,
): Promise<{ id: string; password: string | null }> {
  const chosen = process.env[`DEMO_${account.key}_PASSWORD`] ?? null;
  const id = existing.get(account.email);
  if (id) {
    if (chosen) {
      const { error } = await admin.auth.admin.updateUserById(id, { password: chosen });
      if (error) throw error;
    }
    return { id, password: chosen };
  }
  const password = chosen ?? randomBytes(PASSWORD_BYTES).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    // The same metadata as admin-create-user: the trigger copies the role from app_metadata.
    user_metadata: { full_name: account.full_name, company_name: account.company_name },
    app_metadata: { role: account.role },
  });
  if (error) throw error;
  return { id: data.user.id, password };
}

const daysAgo = (days: number) => new Date(Date.now() - days * MS_PER_DAY).toISOString();

/** Replaces the customer's jobs, candidates and cards with the demo data. */
async function seedCustomer(admin: SupabaseClient, customerId: string, customer: DemoCustomer) {
  // Candidates first: their cards go with them, and then the jobs have none left.
  const removeCandidates = await admin.from("candidates").delete().eq("customer_id", customerId);
  if (removeCandidates.error) throw removeCandidates.error;
  const removeJobs = await admin.from("jobs").delete().eq("customer_id", customerId);
  if (removeJobs.error) throw removeJobs.error;

  const jobs = await admin
    .from("jobs")
    .insert(
      customer.jobs.map(({ title, location, description, status }) => ({
        customer_id: customerId,
        title,
        location,
        description,
        status,
      })),
    )
    .select("id");
  if (jobs.error) throw jobs.error;
  const jobIds = new Map(customer.jobs.map((job, i) => [job.key, jobs.data[i]?.id]));

  const positions = new Map<string, number>();
  for (const candidate of customer.candidates) {
    const longest = Math.max(0, ...candidate.applications.map((a) => a.daysInStage));
    const inserted = await admin
      .from("candidates")
      .insert({
        customer_id: customerId,
        full_name: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone || null,
        notes: candidate.notes || null,
        created_at: daysAgo(longest + 1),
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;

    for (const application of candidate.applications) {
      const jobId = jobIds.get(application.job);
      if (!jobId) throw new Error(`Unknown demo job "${application.job}"`);
      const position = positions.get(application.stage) ?? 0;
      positions.set(application.stage, position + 1);
      // customer_id comes from the job through the trigger (security rule 7).
      const { error } = await admin.from("applications").insert({
        job_id: jobId,
        candidate_id: inserted.data.id,
        stage: application.stage,
        position,
        stage_changed_at: daysAgo(application.daysInStage),
      });
      if (error) throw error;
    }
  }
}

async function main() {
  const url = requireEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  console.log(`Demo data for ${new URL(url).host}`);
  if (!process.argv.includes("--yes")) {
    console.log("This writes accounts and data to that project. Run it again with --yes.");
    process.exitCode = 1;
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const existing = await existingUsers(admin);
  const ids = new Map<string, string>();
  for (const account of DEMO_ACCOUNTS) {
    const { id, password } = await ensureAccount(admin, existing, account);
    ids.set(account.email, id);
    const state = existing.has(account.email) ? "exists" : "created";
    console.log(`  ${account.role.padEnd(8)} ${account.email}  ${state}`);
    // Printed once, here only. Hand it to the reviewers privately.
    if (password) console.log(`           password: ${password}`);
  }

  for (const customer of DEMO_CUSTOMERS) {
    const id = ids.get(customer.account.email);
    if (!id) throw new Error(`No account for ${customer.account.email}`);
    await seedCustomer(admin, id, customer);
    const cards = customer.candidates.reduce((n, c) => n + c.applications.length, 0);
    console.log(
      `  ${customer.account.company_name}: ${customer.jobs.length} jobs, ` +
        `${customer.candidates.length} candidates, ${cards} cards`,
    );
  }
  console.log("Done.");
}

main().catch((error: unknown) => {
  // The message only: never the request, which carries the service role key.
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error);
  console.error(`Seeding failed: ${message}`);
  process.exitCode = 1;
});
