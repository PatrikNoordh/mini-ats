import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { setOwnPassword, verifyInvite } from "@/lib/api/auth";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import {
  fieldErrors,
  newPasswordSchema,
  type FormErrors,
  type NewPasswordInput,
} from "@/lib/validation";

const empty: NewPasswordInput = { new_password: "", confirm_password: "" };

/**
 * Where an invited user chooses their own password (ATS-50), with the token from the invite's link,
 * or null when the link holds none. Opening the page does nothing with the invite: only submitting
 * the form verifies it, so an email scanner that opens the link does not use it up. A failed
 * password save after the invite is verified is retried without verifying again, since the link
 * works only once.
 */
export function AcceptInvite({ tokenHash }: { tokenHash: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors<NewPasswordInput>>({});
  const [error, setError] = useState<ReturnType<typeof errorCode> | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  // Someone else signed in in this browser would be replaced by the invited user without warning.
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
        await verifyInvite(tokenHash);
        setVerified(true);
      }
      await setOwnPassword(parsed.data.new_password);
      toast.success(t("acceptInvite.done"));
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t("acceptInvite.title")}</h1>
        {!tokenHash ? (
          <>
            <p role="alert" className="mt-4 text-sm text-destructive">
              {t("errors.invite_invalid")}
            </p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link to="/login">{t("acceptInvite.toLogin")}</Link>
            </Button>
          </>
        ) : isLoading ? null : signedInAsOther ? (
          <>
            <p className="mt-4 text-sm">
              {t("acceptInvite.signedInAs", { email: user?.email ?? "" })}
            </p>
            <Button className="mt-6 w-full" onClick={() => void signOut()}>
              {t("acceptInvite.signOut")}
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{t("acceptInvite.subtitle")}</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <Field
                id="new-password"
                label={t("acceptInvite.password")}
                hint={t("acceptInvite.passwordHint", { min: MIN_PASSWORD_LENGTH })}
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
                label={t("acceptInvite.confirmPassword")}
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
                {busy ? t("acceptInvite.submitting") : t("acceptInvite.submit")}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
