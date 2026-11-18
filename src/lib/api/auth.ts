import { isAuthError } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { AppError, type ErrorCode } from "@/lib/errors";

export interface AuthUser {
  id: string;
  email: string;
}

/** The code for a Supabase Auth error, or null when it has none the UI knows. */
export function authErrorCode(error: unknown): ErrorCode | null {
  if (!isAuthError(error)) return null;
  if (error.code === "invalid_credentials") return "invalid_credentials";
  // A login is banned while its account is deleted (ATS-27) or its company is (ATS-46). Auth
  // reports both the same way, before there is a session to tell them apart, so the message
  // covers both (ATS-61).
  if (error.code === "user_banned") return "account_or_company_deleted";
  if (error.code === "over_request_rate_limit" || error.status === 429) return "too_many_attempts";
  // Changing your own password (ATS-34). The form checks both first; this is for anything past it.
  if (error.code === "same_password") return "same_password";
  if (error.code === "weak_password") return "weak_password";
  return null;
}

function toAppError(error: unknown): unknown {
  const code = authErrorCode(error);
  return code ? new AppError(code) : error;
}

function toAuthUser(user: { id: string; email?: string | undefined }): AuthUser {
  return { id: user.id, email: user.email ?? "" };
}

/**
 * Uses the token from a link in one of Auth's emails, and signs its user in. Only called when the
 * user submits the link's page, never when it loads, so an email scanner that opens the link does
 * not use it up. Auth answers otp_expired for a link that has expired, has been used or was
 * replaced by a newer email, and user_banned for a deleted account or company.
 */
async function verifyEmailLink(
  tokenHash: string,
  type: "invite" | "recovery",
  invalid: ErrorCode,
): Promise<AuthUser> {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) throw error.code === "otp_expired" ? new AppError(invalid) : toAppError(error);
  if (!data.user) throw new AppError(invalid);
  return toAuthUser(data.user);
}

/** Accepts an invite with the token from its email (ATS-50). */
export function verifyInvite(tokenHash: string): Promise<AuthUser> {
  return verifyEmailLink(tokenHash, "invite", "invite_invalid");
}

/** Signs in with the token from a reset email, to choose a new password (ATS-51). */
export function verifyRecovery(tokenHash: string): Promise<AuthUser> {
  return verifyEmailLink(tokenHash, "recovery", "reset_link_invalid");
}

/**
 * Sends a link to choose a new password, if the address has an account (ATS-51). Auth answers the
 * same for an address without one, and sends nothing. It also refuses a second request for the
 * same account within a short time, which it can only do for an address that has one, so that
 * refusal counts as sent too: the page says the same whatever address is entered. A deleted
 * account gets the email, but Auth refuses its link (user_banned).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (!error || error.code === "over_email_send_rate_limit") return;
  throw toAppError(error);
}

/**
 * Sets the signed-in user's password without asking for the current one. Only for a user who has
 * just accepted an invite and has none yet; changing a password goes through changePassword, and
 * a reset through resetOwnPassword.
 */
export async function setOwnPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAppError(error);
}

/**
 * Sets a new password for a user signed in by a reset link (ATS-51), who does not know the old
 * one, then signs out their other devices, as a password change does (ATS-34): whoever reset it
 * may be shutting someone else out.
 */
export async function resetOwnPassword(password: string): Promise<PasswordChange> {
  await setOwnPassword(password);
  const others = await supabase.auth.signOut({ scope: "others" });
  return { otherSessionsSignedOut: !others.error };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw toAppError(error);
  return toAuthUser(data.user);
}

/**
 * Signs out on this device only, so a user's other devices stay signed in. supabase-js removes
 * the local session even when the request fails (for example offline), so an error only counts
 * when this device is still signed in.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (!error) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) throw toAppError(error);
}

/**
 * Whether Auth says this device's session no longer exists: it was signed out from another
 * device, by a password change (ATS-34) or by deleting the account. The access token itself stays
 * valid until it expires, so only Auth can tell. Any other answer, a network failure included,
 * counts as the session still being there, so going offline never signs anyone out.
 */
export async function sessionIsGone(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const { error } = await supabase.auth.getUser();
  return isAuthError(error) && error.code === "session_not_found";
}

/** How a password change went. The password is changed in both cases. */
export interface PasswordChange {
  /** False when signing out the user's other devices failed. */
  otherSessionsSignedOut: boolean;
}

/**
 * Changes the signed-in user's own password (ATS-34). The current password is checked first by
 * signing in with it again, so someone at a computer left signed in cannot take over the account;
 * a wrong one is `wrong_current_password` and nothing changes. Then the user's other sessions are
 * signed out, and this device stays signed in. No Edge Function and no service role: Supabase
 * Auth changes a user's own password with the user's own session.
 */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<PasswordChange> {
  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (check.error) {
    const code = authErrorCode(check.error);
    throw code === "invalid_credentials"
      ? new AppError("wrong_current_password")
      : toAppError(check.error);
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw toAppError(error);
  const others = await supabase.auth.signOut({ scope: "others" });
  return { otherSessionsSignedOut: !others.error };
}

/**
 * Calls `onChange` with the signed-in user, or null, now and on every change: sign-in,
 * sign-out, also in another tab, and an expired session. Returns the unsubscribe function.
 */
export function onAuthUserChange(onChange: (user: AuthUser | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase warns against calling the client inside this callback, so hand it on first.
    setTimeout(() => onChange(session ? toAuthUser(session.user) : null), 0);
  });
  return () => data.subscription.unsubscribe();
}
