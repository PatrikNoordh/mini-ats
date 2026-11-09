/// <reference types="node" />
// The parts the demo seed (seed-demo.ts, ATS-15) and the end-to-end test seed (seed-e2e.ts,
// ATS-36) share: accounts through the Auth admin API, customers' companies (ATS-44), and a
// customer's jobs, candidates and cards.
import { randomUUID } from "node:crypto";
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

/**
 * Creates a customer: a company with a new id of its own, then the account as its first member
 * (ATS-45). A customer whose account exists keeps its company, whatever its id, and the company
 * takes the name from the data. Returns the company's id and the account's. A new user without a company sees
 * nothing (docs/next-teams.md), so a customer is never created without one.
 */
export async function upsertCustomer(
  admin: SupabaseClient,
  existing: Map<string, string>,
  account: DemoAccount,
  password: string | null,
): Promise<{ companyId: string; userId: string }> {
  const known = await companyOf(admin, existing.get(account.email));
  if (known) {
    const renamed = await admin
      .from("companies")
      .update({ name: account.company_name })
      .eq("id", known);
    if (renamed.error) throw renamed.error;
    const userId = await upsertAccount(admin, existing, account, password);
    return { companyId: known, userId };
  }
  const companyId = randomUUID();
  const company = await admin
    .from("companies")
    .insert({ id: companyId, name: account.company_name });
  if (company.error) throw company.error;
  try {
    const userId = await addMember(admin, existing, companyId, account, password);
    return { companyId, userId };
  } catch (error) {
    // A company made for an account that could not join it would have no member.
    await admin.from("companies").delete().eq("id", companyId);
    throw error;
  }
}

/**
 * Creates the account if it is missing, and makes it a member of the company. Running it again
 * changes nothing. An account that is a member of another company is refused by the database.
 * Returns the account's id.
 */
export async function addMember(
  admin: SupabaseClient,
  existing: Map<string, string>,
  companyId: string,
  account: DemoAccount,
  password: string | null,
): Promise<string> {
  const userId = await upsertAccount(admin, existing, account, password);
  const membership = await admin
    .from("company_members")
    .upsert(
      { company_id: companyId, user_id: userId },
      { onConflict: "company_id,user_id", ignoreDuplicates: true },
    );
  if (membership.error) throw membership.error;
  return userId;
}

/** The company the user is a member of, or null for no user or no membership. */
async function companyOf(
  admin: SupabaseClient,
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? String(data.company_id) : null;
}

const daysAgo = (days: number) => new Date(Date.now() - days * MS_PER_DAY).toISOString();

/** The ids of the customer's default stages, by key. Every company gets them (ATS-38, ATS-44). */
async function defaultStageIds(
  admin: SupabaseClient,
  customerId: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("pipeline_stages")
    .select("id, default_key")
    .eq("customer_id", customerId)
    .not("default_key", "is", null);
  if (error) throw error;
  const ids = new Map<string, string>();
  for (const stage of data) ids.set(String(stage.default_key), String(stage.id));
  return ids;
}

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
  const stageIds = await defaultStageIds(admin, customerId);

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
      const stageId = stageIds.get(application.stage);
      if (!stageId) throw new Error(`The customer has no "${application.stage}" stage`);
      const position = positions.get(stageId) ?? 0;
      positions.set(stageId, position + 1);
      // customer_id comes from the job through the trigger (security rule 7).
      const { error } = await admin.from("applications").insert({
        job_id: jobId,
        candidate_id: inserted.data.id,
        stage_id: stageId,
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
