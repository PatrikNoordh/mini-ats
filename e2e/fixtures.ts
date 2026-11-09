/// <reference types="node" />
// What every end-to-end test builds on (ATS-37). Each test makes its own customers with their own
// jobs, candidates and cards, named with a tag unique to the attempt, so the tests can run in any
// order and a retried test never meets data an earlier attempt changed. The admin comes from the
// seed (e2e/global-setup.ts) and no test changes it.
import { randomBytes } from "node:crypto";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DemoAccount, DemoCandidate, DemoCustomer, DemoJob } from "../scripts/demo-data.ts";
import { E2E_PASSWORD } from "../scripts/e2e-data.ts";
import { localStack } from "../scripts/local-stack.ts";
import { addMember, seedCustomer, upsertCustomer } from "../scripts/seed-shared.ts";
import sv from "../src/locales/sv.json" with { type: "json" };

export { expect, sv };

/** Bytes of randomness in a tag: 8 hex characters, together with the time. */
const TAG_BYTES = 4;

/** A user the test can sign in as. */
export interface TestUser {
  id: string;
  email: string;
  fullName: string;
}

/** A company with its first user. `email` and `fullName` are the first user's. */
export interface TestCustomer {
  /** The company's id: every customer_id of its data, and its CV folder. */
  id: string;
  company: string;
  /** The first user's id, never the company's (ATS-45). */
  userId: string;
  email: string;
  fullName: string;
}

/**
 * The members a customer test signs in as: every test that acts as a customer runs as the
 * company's first user and again as a second user of the same company (ATS-45, AC6).
 */
export const MEMBERS = ["first", "second"] as const;
export type Member = (typeof MEMBERS)[number];

export interface CustomerData {
  jobs?: DemoJob[];
  candidates?: DemoCandidate[];
}

interface Fixtures {
  /** Unique to this attempt; goes into every name the test creates. */
  tag: string;
  /** The ids of the users the test made, deleted after it. */
  users: string[];
  /**
   * Creates a customer, a company with a new id and its first user, with the given data. The
   * company and its users are removed after the test.
   */
  makeCustomer: (name: string, data?: CustomerData) => Promise<TestCustomer>;
  /** Adds another user to the customer's company. */
  addMember: (customer: TestCustomer, name: string) => Promise<TestUser>;
  /** The customer's first user, or a second user added to the company for the test. */
  memberOf: (customer: TestCustomer, member: Member) => Promise<TestUser>;
  /**
   * Companies and accounts a test makes through the app, by name and email, so they are removed
   * after it like the others. One that the test deleted for good is skipped.
   */
  madeInApp: { companies: string[]; emails: string[] };
}

function serviceClient(): SupabaseClient {
  const stack = localStack();
  return createClient(stack.url, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures from the pattern.
  tag: async ({}, use) => {
    await use(`${Date.now().toString(36)}${randomBytes(TAG_BYTES).toString("hex")}`);
  },
  makeCustomer: async ({ tag, users }, use) => {
    const admin = serviceClient();
    const created: string[] = [];
    await use(async (name, data = {}) => {
      const email = `${name.toLowerCase()}-${tag}@e2e.test`;
      const fullName = `${name} Testsson ${tag}`;
      const company = `${name} AB ${tag}`;
      const customer: DemoCustomer = {
        account: { key: name, role: "customer", email, full_name: fullName, company_name: company },
        jobs: data.jobs ?? [],
        candidates: data.candidates ?? [],
      };
      const { companyId: id, userId } = await upsertCustomer(
        admin,
        new Map(),
        customer.account,
        E2E_PASSWORD,
      );
      created.push(id);
      users.push(userId);
      if (customer.jobs.length > 0) await seedCustomer(admin, id, customer);
      return { id, company, userId, email, fullName };
    });
    // Removing the company removes its rows (on delete cascade from companies); removing a user
    // removes only the login, its profile and its membership. The users go in the users fixture.
    for (const id of created) {
      const { error } = await admin.from("companies").delete().eq("id", id);
      if (error) throw error;
    }
  },
  addMember: async ({ tag, users }, use) => {
    const admin = serviceClient();
    await use(async (customer, name) => {
      const email = `${name.toLowerCase()}-${tag}@e2e.test`;
      const fullName = `${name} Testsson ${tag}`;
      const account: DemoAccount = {
        key: name,
        role: "customer",
        email,
        full_name: fullName,
        company_name: customer.company,
      };
      const id = await addMember(admin, new Map(), customer.id, account, E2E_PASSWORD);
      users.push(id);
      return { id, email, fullName };
    });
  },
  memberOf: async ({ addMember: add }, use) => {
    await use(async (customer, member) =>
      member === "first"
        ? { id: customer.userId, email: customer.email, fullName: customer.fullName }
        : add(customer, "Kollega"),
    );
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures from the pattern.
  madeInApp: async ({}, use) => {
    const made = { companies: [] as string[], emails: [] as string[] };
    await use(made);
    const admin = serviceClient();
    if (made.companies.length > 0) {
      const { error } = await admin.from("companies").delete().in("name", made.companies);
      if (error) throw error;
    }
    if (made.emails.length > 0) {
      const { data, error } = await admin.from("profiles").select("id").in("email", made.emails);
      if (error) throw error;
      for (const { id } of data) {
        const removed = await admin.auth.admin.deleteUser(String(id));
        if (removed.error) throw removed.error;
      }
    }
  },
  // Every user a test made, removed after the companies (the fixtures above depend on it).
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures from the pattern.
  users: async ({}, use) => {
    const created: string[] = [];
    await use(created);
    const admin = serviceClient();
    for (const id of created) {
      const { error } = await admin.auth.admin.deleteUser(id);
      // A test that deleted a company for good has deleted its users already.
      if (error && error.status !== 404) throw error;
    }
  },
});

/** The smallest file the cvs bucket takes as a PDF. */
const TINY_PDF = "%PDF-1.4\n%%EOF\n";

/**
 * Gives a seeded candidate a CV, as an upload in the app would: the file in the customer's folder
 * and cv_path pointing at it. Returns the path.
 */
export async function addCv(customerId: string, fullName: string): Promise<string> {
  const admin = serviceClient();
  const found = await admin
    .from("candidates")
    .select("id")
    .eq("customer_id", customerId)
    .eq("full_name", fullName)
    .single();
  if (found.error) throw found.error;
  const path = `${customerId}/${String(found.data.id)}.pdf`;
  const upload = await admin.storage
    .from("cvs")
    .upload(path, new Blob([TINY_PDF], { type: "application/pdf" }), { upsert: true });
  if (upload.error) throw upload.error;
  const update = await admin.from("candidates").update({ cv_path: path }).eq("id", found.data.id);
  if (update.error) throw update.error;
  return path;
}

/** Takes the user out of their company, as an admin will on the members page (ATS-46). */
export async function removeMembership(userId: string): Promise<void> {
  const { error } = await serviceClient().from("company_members").delete().eq("user_id", userId);
  if (error) throw error;
}

/** Where the candidate's CV is in the cvs bucket, looked up past RLS. */
export async function cvPathOf(customerId: string, fullName: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from("candidates")
    .select("cv_path")
    .eq("customer_id", customerId)
    .eq("full_name", fullName)
    .single();
  if (error) throw error;
  if (!data.cv_path) throw new Error(`${fullName} has no CV`);
  return String(data.cv_path);
}

/** Whether a file is in the cvs bucket, looked up past the storage policies. */
export async function cvExists(path: string): Promise<boolean> {
  const [folder = "", name = ""] = path.split("/");
  const { data, error } = await serviceClient().storage.from("cvs").list(folder, { search: name });
  if (error) throw error;
  return data.some((file) => file.name === name);
}

/** An open job for makeCustomer. */
export function job(key: string, title: string): DemoJob {
  return { key, title, location: "Teststad", description: "", status: "open" };
}

/** A candidate for makeCustomer with one card on the given job, in the given stage. */
export function candidate(
  fullName: string,
  jobKey: string,
  stage: DemoCandidate["applications"][number]["stage"] = "new",
): DemoCandidate {
  return {
    full_name: fullName,
    email: `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@e2e.test`,
    phone: "",
    notes: "",
    applications: [{ job: jobKey, stage, daysInStage: 1 }],
  };
}

/** Fills in and sends the sign-in form, whatever the answer. */
export async function submitSignIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(sv.login.email, { exact: true }).fill(email);
  await page.getByLabel(sv.login.password, { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: sv.login.submit }).click();
}

export async function signIn(page: Page, email: string) {
  await submitSignIn(page, email);
  await expect(page).toHaveURL(/\/pipeline/);
}

/** Fills a translation's {{placeholders}}, for texts the test reads back from the page. */
export function text(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}

/** The board column of a stage, named by its heading. */
export function column(page: Page, stage: keyof typeof sv.stages) {
  return page.getByRole("group", { name: sv.stages[stage], exact: true });
}

/** A card on the board or in a column, named by the candidate (the label adds job and days). */
export function card(scope: Page | Locator, name: string) {
  return scope.getByRole("button", { name: new RegExp(`^${name},`) });
}

/** How many jobs the company has, counted past RLS. */
export async function jobCount(companyId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", companyId);
  if (error) throw error;
  return count ?? 0;
}
