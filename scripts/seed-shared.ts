/// <reference types="node" />
// The parts the demo seed (seed-demo.ts, ATS-15) and the end-to-end test seed (seed-e2e.ts,
// ATS-36) share: accounts through the Auth admin API, and a customer's jobs, candidates and cards.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DemoAccount, DemoCustomer } from "./demo-data.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Auth's listUsers page size; the projects have far fewer users. */
const USERS_PER_PAGE = 1000;

/** The ids of the accounts that already exist, by email. */
export async function existingUsers(admin: SupabaseClient): Promise<Map<string, string>> {
  const users = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw error;
    for (const user of data.users) if (user.email) users.set(user.email, user.id);
    if (data.users.length < USERS_PER_PAGE) return users;
  }
}

/**
 * Creates the account if it is missing, or sets the password of an existing one when a password
 * is given. A new account needs a password. Returns the account's id.
 */
export async function upsertAccount(
  admin: SupabaseClient,
  existing: Map<string, string>,
  account: DemoAccount,
  password: string | null,
): Promise<string> {
  const id = existing.get(account.email);
  if (id) {
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw error;
    }
    return id;
  }
  if (!password) throw new Error(`A new account needs a password: ${account.email}`);
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    // The same metadata as admin-create-user: the trigger copies the role from app_metadata.
    user_metadata: { full_name: account.full_name, company_name: account.company_name },
    app_metadata: { role: account.role },
  });
  if (error) throw error;
  return data.user.id;
}

const daysAgo = (days: number) => new Date(Date.now() - days * MS_PER_DAY).toISOString();

/** Replaces the customer's jobs, candidates and cards with the given data. */
export async function seedCustomer(
  admin: SupabaseClient,
  customerId: string,
  customer: DemoCustomer,
) {
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
      if (!jobId) throw new Error(`Unknown job "${application.job}"`);
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

/** The error's message only: never the request, which carries the service role key. */
export function errorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);
}
