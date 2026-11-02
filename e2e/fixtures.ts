/// <reference types="node" />
// What every end-to-end test builds on (ATS-37). Each test makes its own customers with their own
// jobs, candidates and cards, named with a tag unique to the attempt, so the tests can run in any
// order and a retried test never meets data an earlier attempt changed. The admin comes from the
// seed (e2e/global-setup.ts) and no test changes it.
import { randomBytes } from "node:crypto";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DemoCandidate, DemoCustomer, DemoJob } from "../scripts/demo-data.ts";
import { E2E_PASSWORD } from "../scripts/e2e-data.ts";
import { localStack } from "../scripts/local-stack.ts";
import { seedCustomer, upsertAccount } from "../scripts/seed-shared.ts";
import sv from "../src/locales/sv.json" with { type: "json" };

export { expect, sv };

/** Bytes of randomness in a tag: 8 hex characters, together with the time. */
const TAG_BYTES = 4;

export interface TestCustomer {
  id: string;
  email: string;
  fullName: string;
  company: string;
}

export interface CustomerData {
  jobs?: DemoJob[];
  candidates?: DemoCandidate[];
}

interface Fixtures {
  /** Unique to this attempt; goes into every name the test creates. */
  tag: string;
  /** Creates a customer account with the given data. The account is removed after the test. */
  makeCustomer: (name: string, data?: CustomerData) => Promise<TestCustomer>;
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
  makeCustomer: async ({ tag }, use) => {
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
      const id = await upsertAccount(admin, new Map(), customer.account, E2E_PASSWORD);
      created.push(id);
      if (customer.jobs.length > 0) await seedCustomer(admin, id, customer);
      return { id, email, fullName, company };
    });
    // Removing the account removes its rows too (on delete cascade from auth.users).
    for (const id of created) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
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
