// Invites by email (ATS-50). Auth sends the invite template, whose link opens the app's
// accept-invite page, and the user chooses their own password there.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

/**
 * Why Auth did not send an invite: the account is confirmed, because it accepted an invite or
 * was made with a password, or the email could not be sent.
 */
export type InviteResult = "already_confirmed" | "not_sent" | null;

/** The parts of an Auth error that tell why an invite was refused. */
export interface AuthErrorLike {
  code?: string;
  status?: number;
}

/**
 * Why an invite was refused, or null for an error that is not about the invite, which the caller
 * throws. Not sent covers the email provider failing, a rate limit, and Supabase's built-in email
 * refusing an address outside the project's team, as in production while email is off
 * (docs/auth-email.md).
 */
export function inviteRefusal(error: AuthErrorLike): Exclude<InviteResult, null> | null {
  if (error.code === "email_exists") return "already_confirmed";
  if (
    error.code === "email_address_not_authorized" ||
    error.status === 429 ||
    (error.status ?? 0) >= 500
  ) {
    return "not_sent";
  }
  return null;
}

/**
 * Emails an invite to an account that has not been confirmed. Sending again replaces the earlier
 * link, which stops working. Runs with the service role.
 */
export async function sendInvite(service: SupabaseClient, email: string): Promise<InviteResult> {
  const { error } = await service.auth.admin.inviteUserByEmail(email);
  if (!error) return null;
  const refusal = inviteRefusal(error);
  if (refusal) return refusal;
  throw error;
}
