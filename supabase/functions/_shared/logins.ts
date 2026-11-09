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
