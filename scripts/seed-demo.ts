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
// trigger runs. Each customer gets its company first, with a new id of its own, and its account
// as the company's first member (ATS-45); a customer that exists keeps its company. A new account
// gets the password from DEMO_<KEY>_PASSWORD, or a generated one that is printed once. An existing
// account keeps its password unless one is given. Every run rebuilds the jobs, candidates and
// cards of the demo customers, and touches no other customer's rows. A demo customer whose login
// still has its company's id gets a new login first, with the same email and demo password
// (ATS-58).
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DEMO_ACCOUNTS, DEMO_CUSTOMERS } from "./demo-data.ts";
import { supabaseSwapDeps, swapLogins } from "./login-swap.ts";
import {
  errorMessage,
  existingUsers,
  seedCustomer,
  upsertAccount,
  upsertCustomer,
} from "./seed-shared.ts";

/** Bytes of randomness in a generated password: 24 characters of base64url. */
const PASSWORD_BYTES = 18;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the comment at the top of this script.`);
  return value;
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
  await swapDemoLogins(admin);
  const existing = await existingUsers(admin);
  // The company of each customer account, by email.
  const ids = new Map<string, string>();
  for (const account of DEMO_ACCOUNTS) {
    const chosen = process.env[`DEMO_${account.key}_PASSWORD`] ?? null;
    const password = existing.has(account.email)
      ? chosen
      : (chosen ?? randomBytes(PASSWORD_BYTES).toString("base64url"));
    if (account.role === "customer") {
      const { companyId } = await upsertCustomer(admin, existing, account, password);
      ids.set(account.email, companyId);
    } else {
      await upsertAccount(admin, existing, account, password);
    }
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

/**
 * The demo customers seeded before ATS-45 have a login with their company's id. Like every such
 * login, it is replaced by a new account with the same email (ATS-58, scripts/login-swap.ts),
 * with the demo password from DEMO_<KEY>_PASSWORD, so the reviewers keep theirs. Without that
 * variable the old login is kept and the seed says so. Runs first, so a swap that stopped is
 * finished before the accounts are looked up by email.
 */
async function swapDemoLogins(admin: SupabaseClient) {
  const deps = supabaseSwapDeps(admin);
  const passwords = new Map<string, string>();
  const missing: string[] = [];
  for (const { account } of DEMO_CUSTOMERS) {
    const password = process.env[`DEMO_${account.key}_PASSWORD`];
    if (password) passwords.set(account.email, password);
    else missing.push(account.key);
  }
  // A login is planned only when its id is a company's, so these are the old demo logins.
  const only = new Set(
    (await deps.users())
      .filter((user) => passwords.has(user.swapEmail ?? user.email))
      .map((user) => user.id),
  );
  const { plan, results } = await swapLogins(deps, {
    apply: true,
    only,
    password: (swap) => passwords.get(swap.email) ?? "",
  });
  for (const result of results) {
    if (result.error) throw new Error(`The login swap for ${result.email} failed: ${result.error}`);
    console.log(`  swapped  ${result.email}: a new login with the same demo password`);
  }
  if (plan.swaps.length === 0 && missing.length > 0) {
    const names = missing.map((key) => `DEMO_${key}_PASSWORD`).join(", ");
    console.log(`  A demo login with its company's id is swapped only with ${names} set.`);
  }
}

main().catch((error: unknown) => {
  console.error(`Seeding failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
