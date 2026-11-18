import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AcceptInvite } from "@/components/auth/AcceptInvite";
import { MAX_TOKEN_HASH_LENGTH } from "@/lib/constants";
import { pageHead } from "@/lib/i18n";

// The link in the invite email (supabase/templates/invite.html). Anything else is no invite.
const searchSchema = z.object({
  token_hash: z.string().min(1).max(MAX_TOKEN_HASH_LENGTH).optional().catch(undefined),
  type: z.literal("invite").optional().catch(undefined),
});

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (s) => searchSchema.parse(s),
  head: ({ match }) => pageHead(match.context.language, "acceptInvite"),
  component: AcceptInvitePage,
});

/** An invited user chooses their own password here (ATS-50). */
function AcceptInvitePage() {
  const { token_hash: tokenHash, type } = Route.useSearch();
  return <AcceptInvite tokenHash={tokenHash && type === "invite" ? tokenHash : null} />;
}
