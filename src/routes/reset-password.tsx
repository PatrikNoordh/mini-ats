import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ResetPassword } from "@/components/auth/ResetPassword";
import { MAX_TOKEN_HASH_LENGTH } from "@/lib/constants";
import { pageHead } from "@/lib/i18n";

// The link in the reset email (supabase/templates/recovery.html). Anything else is no link.
const searchSchema = z.object({
  token_hash: z.string().min(1).max(MAX_TOKEN_HASH_LENGTH).optional().catch(undefined),
  type: z.literal("recovery").optional().catch(undefined),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s) => searchSchema.parse(s),
  head: ({ match }) => pageHead(match.context.language, "resetPassword"),
  component: ResetPasswordPage,
});

/** A user who forgot their password chooses a new one here (ATS-51). */
function ResetPasswordPage() {
  const { token_hash: tokenHash, type } = Route.useSearch();
  return <ResetPassword tokenHash={tokenHash && type === "recovery" ? tokenHash : null} />;
}
