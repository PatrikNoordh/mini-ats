import { SetPasswordFromLink } from "@/components/auth/SetPasswordFromLink";
import { setOwnPassword, verifyInvite } from "@/lib/api/auth";

async function saveFirstPassword(password: string) {
  await setOwnPassword(password);
  return "done" as const;
}

/** Where an invited user chooses their own password (ATS-50). */
export function AcceptInvite({ tokenHash }: { tokenHash: string | null }) {
  return (
    <SetPasswordFromLink
      tokenHash={tokenHash}
      text="acceptInvite"
      invalid="invite_invalid"
      restartTo="/login"
      verify={verifyInvite}
      save={saveFirstPassword}
    />
  );
}
