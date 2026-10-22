import { ACCOUNT_DELETE_GRACE_DAYS, MS_PER_DAY } from "./constants";
import type { Profile } from "@/types";

/** An account that is not deleted. */
export function isActive(profile: Pick<Profile, "deleted_at">): boolean {
  return profile.deleted_at === null;
}

/** When an account deleted at `deletedAt` is deleted for good. */
export function purgeDate(deletedAt: string | Date): Date {
  return new Date(new Date(deletedAt).getTime() + ACCOUNT_DELETE_GRACE_DAYS * MS_PER_DAY);
}

/**
 * What the admin types to delete an account for good: the company name, or the email for an
 * account without one (an admin's company is the platform itself).
 */
export function deleteConfirmText(
  profile: Pick<Profile, "role" | "company_name" | "email">,
): string {
  return profile.role === "admin" || !profile.company_name ? profile.email : profile.company_name;
}
