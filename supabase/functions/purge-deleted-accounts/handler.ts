import { json } from "../_shared/cors.ts";

/** The header the nightly cron job sends, with the secret from Vault. */
export const CRON_SECRET_HEADER = "x-cron-secret";

/**
 * The Supabase actions, passed in so the flow can be tested without a project. There is no user
 * here, only the cron job, so everything runs with the service role: the purge is the
 * privileged action this function exists for (CLAUDE.md, security rule 2).
 *
 * A user's data is their company's, and the CV folder is named after the company (ATS-44), so
 * purging a user removes only their login. Purging a company removes its CV folder, its members'
 * logins, then the company with all its data (ATS-46, ../_shared/company-purge.ts).
 */
export interface Deps {
  /** The ids of companies deleted more than 30 days ago (companies_due_for_purge()). */
  listCompaniesDue: () => Promise<string[]>;
  purgeCompany: (id: string) => Promise<void>;
  /** The ids of accounts deleted more than 30 days ago (accounts_due_for_purge()). */
  listDue: () => Promise<string[]>;
  /** Deletes the Auth user; the cascades remove the profile and the membership. */
  deleteUser: (id: string) => Promise<void>;
}

/** Compares in time that does not depend on where the strings differ. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) difference |= (a[i] ?? 0) ^ b[i]!;
  return difference === 0;
}

/** One failing never stops the others; tomorrow's run tries it again. */
async function purgeEach(
  ids: string[],
  purge: (id: string) => Promise<void>,
  what: "company" | "account",
): Promise<{ purged: number; failed: number }> {
  let purged = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await purge(id);
      purged++;
    } catch (error) {
      console.error(`purge-deleted-accounts: could not purge a ${what}`, id, error);
      failed++;
    }
  }
  return { purged, failed };
}

export function createHandler(cronSecret: string, deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!sameSecret(req.headers.get(CRON_SECRET_HEADER) ?? "", cronSecret)) {
      return json({ error: "forbidden" }, 403);
    }

    try {
      // Companies first: their members' logins go with them, so the accounts listed after are
      // only the ones deleted on their own.
      const companies = await purgeEach(
        await deps.listCompaniesDue(),
        deps.purgeCompany,
        "company",
      );
      const accounts = await purgeEach(await deps.listDue(), deps.deleteUser, "account");
      const failed = companies.failed + accounts.failed;
      return json(
        { companies: companies.purged, purged: accounts.purged, failed },
        failed ? 500 : 200,
      );
    } catch (error) {
      console.error("purge-deleted-accounts failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
