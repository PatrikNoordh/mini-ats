/// <reference types="node" />
// Seeds the end-to-end test accounts and data into the local Supabase stack (ATS-36). Playwright
// runs it before every run (e2e/global-setup.ts), so each run starts from the same data. To look
// at the data in the app yourself:
//
//   npx supabase start
//   npm run seed:e2e
//
// It only ever writes to the local stack: localStack() refuses any other host.
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { E2E_ACCOUNTS, E2E_CUSTOMERS, E2E_PASSWORD } from "./e2e-data.ts";
import { localStack } from "./local-stack.ts";
import { errorMessage, existingUsers, seedCustomer, upsertAccount } from "./seed-shared.ts";

export async function seedE2e() {
  const stack = localStack();
  const admin = createClient(stack.url, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const existing = await existingUsers(admin);
  const ids = new Map<string, string>();
  for (const account of E2E_ACCOUNTS) {
    ids.set(account.email, await upsertAccount(admin, existing, account, E2E_PASSWORD));
  }
  for (const customer of E2E_CUSTOMERS) {
    const id = ids.get(customer.account.email);
    if (!id) throw new Error(`No account for ${customer.account.email}`);
    await seedCustomer(admin, id, customer);
  }
}

// Run from the command line (npm run seed:e2e), not when Playwright imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedE2e()
    .then(() => console.log("End-to-end data seeded into the local stack."))
    .catch((error: unknown) => {
      console.error(`Seeding failed: ${errorMessage(error)}`);
      process.exitCode = 1;
    });
}
