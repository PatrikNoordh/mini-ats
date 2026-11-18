import { SetPasswordFromLink } from "@/components/auth/SetPasswordFromLink";
import { resetOwnPassword, verifyRecovery } from "@/lib/api/auth";

async function saveNewPassword(password: string) {
  const { otherSessionsSignedOut } = await resetOwnPassword(password);
  return otherSessionsSignedOut ? ("done" as const) : ("doneOthersKept" as const);
}

/**
 * Where a user who forgot their password chooses a new one, from the link in the reset email
 * (ATS-51). A deleted account, or a member of a deleted company, is refused when the link is used.
 */
export function ResetPassword({ tokenHash }: { tokenHash: string | null }) {
  return (
    <SetPasswordFromLink
      tokenHash={tokenHash}
      text="resetPassword"
      invalid="reset_link_invalid"
      restartTo="/forgot-password"
      verify={verifyRecovery}
      save={saveNewPassword}
    />
  );
}
