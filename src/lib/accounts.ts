import { ACCOUNT_DELETE_GRACE_DAYS, MS_PER_DAY } from "./constants";
import type { Profile } from "@/types";

/** An account or a company that is not deleted. */
export function isActive(row: { deleted_at: string | null }): boolean {
  return row.deleted_at === null;
}

/**
 * A customer user without an active company: no membership, or RLS no longer shows it because the
 * company or the user is deleted (ATS-45). Such a user sees nothing and is signed out. Admins
 * belong to no company.
 */
export function hasNoCompany(profile: Pick<Profile, "role" | "company_id">): boolean {
  return profile.role === "customer" && profile.company_id === null;
}

/** When an account deleted at `deletedAt` is deleted for good. */
export function purgeDate(deletedAt: string | Date): Date {
  return new Date(new Date(deletedAt).getTime() + ACCOUNT_DELETE_GRACE_DAYS * MS_PER_DAY);
}

/**
 * What the admin types to delete an account for good: its email, which names one login. The
 * company's data is never part of it (ATS-46).
 */
export function deleteConfirmText(profile: Pick<Profile, "email">): string {
  return profile.email;
}
