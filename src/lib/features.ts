import { z } from "zod";

// Features a deployment switches on with VITE_* variables, read once when the app loads.

/** Only the exact text "true" switches a feature on; anything else, or nothing, leaves it off. */
const switchSchema = z.object({ VITE_EMAIL_ENABLED: z.unknown() });

/**
 * Whether Auth's emails can reach users here: invites (ATS-50) and password reset (ATS-51). False
 * by default and in production, where Supabase's built-in email only reaches the project's team;
 * true on the local stack and in CI, where Mailpit catches them (docs/auth-email.md). The flows
 * that need an email only show when it is true, so the app never offers one whose email cannot
 * arrive.
 */
export function parseEmailEnabled(env: Record<string, unknown>): boolean {
  return switchSchema.parse(env).VITE_EMAIL_ENABLED === "true";
}

export const EMAIL_ENABLED = parseEmailEnabled(import.meta.env);
