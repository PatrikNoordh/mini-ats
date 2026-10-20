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
  if (error.code === "over_request_rate_limit" || error.status === 429) return "too_many_attempts";
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
