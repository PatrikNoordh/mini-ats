// The login swap (ATS-58) on the local stack. A company shaped as ATS-44 left the migrated ones:
// its first login has the company's id, and that login uploaded the CV itself, so it owns the
// file in Storage. The swap must replace the login without losing the file or any row.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { E2E_PASSWORD } from "../scripts/e2e-data.ts";
import { localStack } from "../scripts/local-stack.ts";
import { supabaseSwapDeps, swapLogins } from "../scripts/login-swap.ts";
import { seedCustomer } from "../scripts/seed-shared.ts";
import {
  candidate,
  card,
  cvExists,
  cvPathOf,
  expect,
  job,
  serviceClient,
  signIn,
  sv,
  test,
} from "./fixtures.ts";

/** The smallest file the cvs bucket takes as a PDF. */
const TINY_PDF = "%PDF-1.4\n%%EOF\n";

test("the swap replaces a login that has its company's id and owns its CVs, and keeps every row and file", async ({
  page,
  madeInApp,
  tag,
}) => {
  const admin = serviceClient();
  const companyId = randomUUID();
  const companyName = `Migrerat AB ${tag}`;
  const email = `migrerad-${tag}@e2e.test`;
  const name = `Stina ${tag}`;
  madeInApp.companies.push(companyName);
  madeInApp.emails.push(email);

  // The shape ATS-44 left: the company, and its first login under the same id.
  const company = await admin.from("companies").insert({ id: companyId, name: companyName });
  if (company.error) throw company.error;
  const created = await admin.auth.admin.createUser({
    id: companyId,
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Migrerad ${tag}`, company_name: companyName },
    app_metadata: { role: "customer" },
  });
  if (created.error) throw created.error;
  const member = await admin
    .from("company_members")
    .insert({ company_id: companyId, user_id: companyId });
  if (member.error) throw member.error;
  await seedCustomer(admin, companyId, {
    account: {
      key: "MIGRATED",
      role: "customer",
      email,
      full_name: name,
      company_name: companyName,
    },
    jobs: [job("j", `Jobb ${tag}`)],
    candidates: [candidate(name, "j")],
  });

  // The old login uploads the CV itself, so the file in Storage is its own.
  const stack = localStack();
  const asOld = createClient(stack.url, stack.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await asOld.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const found = await asOld.from("candidates").select("id").eq("full_name", name).single();
  if (found.error) throw found.error;
  const path = `${companyId}/${String(found.data.id)}.pdf`;
  const upload = await asOld.storage
    .from("cvs")
    .upload(path, new Blob([TINY_PDF], { type: "application/pdf" }));
  if (upload.error) throw upload.error;
  const linked = await asOld.from("candidates").update({ cv_path: path }).eq("id", found.data.id);
  if (linked.error) throw linked.error;

  const { results } = await swapLogins(supabaseSwapDeps(admin), {
    apply: true,
    only: new Set([companyId]),
    password: () => E2E_PASSWORD,
  });
  expect(results).toHaveLength(1);
  expect(results[0]?.error).toBeNull();
  const newId = results[0]?.newId;
  expect(newId).toBeTruthy();
  expect(newId).not.toBe(companyId);

  // The old login is gone; the company, its rows and the file it owned stay.
  const oldLogin = await admin.auth.admin.getUserById(companyId);
  expect(oldLogin.data.user).toBeNull();
  expect(await cvPathOf(companyId, name)).toBe(path);
  expect(await cvExists(path)).toBe(true);

  // The same email signs in to the new login, which sees the company's board and opens the CV.
  await signIn(page, email);
  await card(page, name).click();
  const panel = page.getByRole("dialog", { name });
  const open = panel.getByRole("link", { name: sv.candidateSheet.openCv });
  const href = await open.getAttribute("href");
  if (!href) throw new Error("The CV link has no address");
  expect((await page.request.get(href)).ok()).toBe(true);

  // A second run has nothing left to do.
  const again = await swapLogins(supabaseSwapDeps(admin), {
    apply: true,
    only: new Set([companyId]),
    password: () => E2E_PASSWORD,
  });
  expect(again.plan.swaps).toEqual([]);
});
