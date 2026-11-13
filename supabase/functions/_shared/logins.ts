// Whether a login may sign in follows the account and its company (ATS-46): an account is banned
// while it is deleted, or while the company it is a member of is deleted. Restoring either lifts
// the ban only when the other allows it.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

/** Long enough to never run out during the 30 days; restoring lifts it. */
export const BAN_WHILE_DELETED = "876000h";
export const NO_BAN = "none";

/** Bans the login, or lifts its ban. Runs with the service role. */
export async function setBanned(
  service: SupabaseClient,
  userId: string,
  banned: boolean,
): Promise<void> {
  const { error } = await service.auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_WHILE_DELETED : NO_BAN,
  });
  if (error) throw error;
}

/** Whether the user is a member of a deleted company. */
export async function inDeletedCompany(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await service
    .from("company_members")
    .select("companies(deleted_at)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const company: unknown = data?.companies;
  return (
    typeof company === "object" &&
    company !== null &&
    "deleted_at" in company &&
    company.deleted_at !== null
  );
}

/**
 * The account, ban and membership actions, passed in so the order can be tested without a
 * project. All run with the service role.
 */
export interface LoginDeps {
  setBanned: (userId: string, banned: boolean) => Promise<void>;
  inDeletedCompany: (userId: string) => Promise<boolean>;
  /**
   * Makes the user a member of the company, replacing their membership, or removes it for null.
   * The database refuses a deleted company with company_deleted (ATS-61), returned here.
   */
  writeMembership: (userId: string, companyId: string | null) => Promise<"company_deleted" | null>;
  /** Unmarks a deleted account. */
  unmarkDeleted: (userId: string) => Promise<void>;
}

/** Bans the login if the user is a member of a deleted company. A failure is logged, not thrown. */
async function banIfInDeletedCompany(deps: LoginDeps, userId: string, cause?: unknown) {
  try {
    if (await deps.inDeletedCompany(userId)) await deps.setBanned(userId, true);
  } catch (error) {
    console.error("logins: could not check or restore the ban", { userId, cause, error });
  }
}

/**
 * Moves the user to the company, or out of theirs for null, and opens their login, which was
 * banned if their old company was deleted (ATS-46).
 *
 * The ban is lifted before the membership is written (ATS-61, AC7). A company delete marks the
 * company first and then bans the members it reads, and the database makes a membership wait for
 * that mark, or the mark for the membership. So once the membership is written, a delete running
 * at the same time either refused it or reads it and bans the login, and nothing here lifts that
 * ban afterwards. If the membership is refused or fails, the user is still a member of their old
 * company, and their login is banned again if that company is deleted.
 */
export async function moveToCompany(
  deps: LoginDeps,
  userId: string,
  companyId: string | null,
): Promise<"company_deleted" | null> {
  if (companyId === null) {
    await deps.writeMembership(userId, null);
    await deps.setBanned(userId, false);
    return null;
  }
  await deps.setBanned(userId, false);
  let refusal: "company_deleted" | null;
  try {
    refusal = await deps.writeMembership(userId, companyId);
  } catch (error) {
    await banIfInDeletedCompany(deps, userId, error);
    throw error;
  }
  if (refusal) await banIfInDeletedCompany(deps, userId, refusal);
  return refusal;
}

/**
 * Unmarks the account and opens its login unless its company is deleted (ATS-46). The ban is
 * lifted first and the mark last, so a failure leaves the account deleted and a new restore
 * finishes the work. A company delete running at the same time skips the members it reads as
 * deleted, so the company is checked again after the mark, and the login banned if it is deleted
 * now (ATS-61, AC7).
 */
export async function restoreAccount(deps: LoginDeps, userId: string): Promise<void> {
  if (!(await deps.inDeletedCompany(userId))) await deps.setBanned(userId, false);
  await deps.unmarkDeleted(userId);
  if (await deps.inDeletedCompany(userId)) await deps.setBanned(userId, true);
}

/** The actions with the service role: changing an account is what the admin functions exist for. */
export function loginDeps(service: SupabaseClient): LoginDeps {
  return {
    setBanned: (userId, banned) => setBanned(service, userId, banned),
    inDeletedCompany: (userId) => inDeletedCompany(service, userId),
    writeMembership: async (userId, companyId) => {
      const { error } = companyId
        ? await service
            .from("company_members")
            .upsert({ company_id: companyId, user_id: userId }, { onConflict: "user_id" })
        : await service.from("company_members").delete().eq("user_id", userId);
      if (!error) return null;
      if (error.message === "company_deleted") return "company_deleted";
      throw error;
    },
    unmarkDeleted: async (userId) => {
      const { error } = await service
        .from("profiles")
        .update({ deleted_at: null })
        .eq("id", userId);
      if (error) throw error;
    },
  };
}
