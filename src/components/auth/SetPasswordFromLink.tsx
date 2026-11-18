import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AuthCard } from "@/components/auth/AuthCard";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { errorCode, type ErrorCode } from "@/lib/errors";
import {
  fieldErrors,
  newPasswordSchema,
  type FormErrors,
  type NewPasswordInput,
} from "@/lib/validation";

const empty: NewPasswordInput = { new_password: "", confirm_password: "" };

/** The message shown once the password is saved: plain, or a warning that other devices stay. */
export type PasswordSaved = "done" | "doneOthersKept";

interface SetPasswordFromLinkProps {
  /** The token from the email's link, or null when the link holds none. */
  tokenHash: string | null;
  /** The page's texts: accepting an invite (ATS-50) or resetting a password (ATS-51). */
  text: "acceptInvite" | "resetPassword";
  /** The message for a link that holds no token. */
  invalid: ErrorCode;
  /** Where to start again without a working link. */
  restartTo: "/login" | "/forgot-password";
  /** Uses the link's token and signs its user in. */
  verify: (tokenHash: string) => Promise<unknown>;
  /** Saves the password for the user the link signed in. */
  save: (password: string) => Promise<PasswordSaved>;
}

/**
 * Where a user chooses a password from a link in one of Auth's emails: an invite or a reset.
 * Opening the page does nothing with the link: only submitting the form uses it, so an email
 * scanner that opens the link does not use it up. A failed password save after the link is used
 * is retried without using it again, since it works only once.
 */
export function SetPasswordFromLink({
  tokenHash,
  text,
  invalid,
  restartTo,
  verify,
  save,
}: SetPasswordFromLinkProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors<NewPasswordInput>>({});
  const [error, setError] = useState<ReturnType<typeof errorCode> | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  // Someone else signed in in this browser would be replaced by the link's user without warning.
  const signedInAsOther = !isLoading && !!user && !verified;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = newPasswordSchema.safeParse(form);
    setErrors(parsed.success ? {} : fieldErrors(newPasswordSchema.innerType(), parsed.error));
    if (!parsed.success || !tokenHash) return;
    setBusy(true);
    try {
      if (!verified) {
        await verify(tokenHash);
        setVerified(true);
      }
      const saved = await save(parsed.data.new_password);
      if (saved === "done") toast.success(t(`${text}.done`));
      else toast.warning(t("resetPassword.doneOthersKept"));
      await navigate({ to: "/pipeline", replace: true });
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof NewPasswordInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthCard title={t(`${text}.title`)}>
      {!tokenHash ? (
        <>
          <p role="alert" className="mt-4 text-sm text-destructive">
            {t(`errors.${invalid}`)}
          </p>
          <Button asChild variant="outline" className="mt-6 w-full">
            <Link to={restartTo}>{t(`${text}.restart`)}</Link>
          </Button>
        </>
      ) : isLoading ? null : signedInAsOther ? (
        <>
          <p className="mt-4 text-sm">{t(`${text}.signedInAs`, { email: user?.email ?? "" })}</p>
          <Button className="mt-6 w-full" onClick={() => void signOut()}>
            {t(`${text}.signOut`)}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{t(`${text}.subtitle`)}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field
              id="new-password"
              label={t(`${text}.password`)}
              hint={t(`${text}.passwordHint`, { min: MIN_PASSWORD_LENGTH })}
              error={errors.new_password}
            >
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_BYTES}
                  value={form.new_password}
                  onChange={set("new_password")}
                />
              )}
            </Field>
            <Field
              id="confirm-password"
              label={t(`${text}.confirmPassword`)}
              error={errors.confirm_password}
            >
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_BYTES}
                  value={form.confirm_password}
                  onChange={set("confirm_password")}
                />
              )}
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t(`errors.${error}`)}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? t(`${text}.submitting`) : t(`${text}.submit`)}
            </Button>
          </form>
        </>
      )}
    </AuthCard>
  );
}
