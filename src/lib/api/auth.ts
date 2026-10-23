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
  // A deleted account is banned until it is restored (ATS-27).
  if (error.code === "user_banned") return "account_deleted";
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
