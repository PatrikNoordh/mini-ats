import { json } from "../_shared/cors.ts";

/** The header the nightly cron job sends, with the secret from Vault. */
export const CRON_SECRET_HEADER = "x-cron-secret";

/**
 * The Supabase actions, passed in so the flow can be tested without a project. There is no user
 * here, only the cron job, so everything runs with the service role: the purge is the
 * privileged action this function exists for (CLAUDE.md, security rule 2).
 */
export interface Deps {
  /** The ids of accounts deleted more than 30 days ago (accounts_due_for_purge()). */
  listDue: () => Promise<string[]>;
  /** Removes every CV file in the account's folder. */
  removeCvs: (id: string) => Promise<void>;
  /** Deletes the Auth user; the cascades remove the profile and all its data. */
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

export function createHandler(cronSecret: string, deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!sameSecret(req.headers.get(CRON_SECRET_HEADER) ?? "", cronSecret)) {
      return json({ error: "forbidden" }, 403);
    }

    try {
      const due = await deps.listDue();
      let purged = 0;
      const failed: string[] = [];
      // One account failing never stops the others. Its files go before its user, so a failure
      // leaves the account in place, and tomorrow's run tries it again.
      for (const id of due) {
        try {
          await deps.removeCvs(id);
          await deps.deleteUser(id);
          purged++;
        } catch (error) {
          console.error("purge-deleted-accounts: could not purge an account", id, error);
          failed.push(id);
        }
      }
      return json({ purged, failed: failed.length }, failed.length ? 500 : 200);
    } catch (error) {
      console.error("purge-deleted-accounts failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
